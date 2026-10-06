import { cleanPrompt } from '../shared/prompt-text.js';
import { summarizeTool } from '../shared/tools.js';
import type { FileChange, SpawnRequest, WorldEvent } from '../shared/types.js';

type Json = Record<string, unknown>;

const INTERRUPT_PREFIX = '[Request interrupted by user';
const SPAWN_TOOLS = new Set(['Agent', 'Task']);
const SYNTHETIC_MODEL = '<synthetic>';

/**
 * Turn one transcript line into the world events it carries. Unknown or malformed lines yield
 * no events, so a change in the transcript format degrades a feature instead of crashing.
 * @param line - one parsed JSONL line
 * @returns events, possibly none
 */
export function normalizeLine(line: unknown): WorldEvent[] {
  if (!isObject(line)) return [];
  const at = typeof line.timestamp === 'string' ? line.timestamp : '';
  if (line.type === 'user') return userEvents(line, at);
  if (line.type === 'assistant') return assistantEvents(line, at);
  return [];
}

/**
 * Session metadata carried on a line: the git branch and the AI-written session title.
 * @param line - one parsed JSONL line
 * @returns whichever of branch and title the line has
 */
export function extractMeta(line: unknown): { branch?: string; title?: string } {
  if (!isObject(line)) return {};
  if (line.type === 'ai-title' && typeof line.aiTitle === 'string') return { title: line.aiTitle };
  if (typeof line.gitBranch === 'string' && line.gitBranch) return { branch: line.gitBranch };
  return {};
}

/**
 * Events from a user line: tool results, a human prompt, or an interruption.
 * @param line - user line
 * @param at - line timestamp
 * @returns events
 */
function userEvents(line: Json, at: string): WorldEvent[] {
  const content = isObject(line.message) ? line.message.content : undefined;
  const blocks = Array.isArray(content) ? content.filter(isObject) : [];
  const results = blocks.filter((block) => block.type === 'tool_result');
  if (results.length) return results.map((block) => toolResultEvent(block, line, at, results.length));

  const text = typeof content === 'string' ? content : blocks.map((block) => (typeof block.text === 'string' ? block.text : '')).join('\n\n');
  if (text.startsWith(INTERRUPT_PREFIX)) return [{ kind: 'interrupt', at }];
  if (!isHumanPrompt(line)) return [];
  const promptId = typeof line.promptId === 'string' ? line.promptId : String(line.uuid ?? at);
  return [{ kind: 'prompt', at, text: cleanPrompt(text), promptId }];
}

/**
 * Whether a user line is a prompt typed by the human (not a tool result, reminder or notification).
 * @param line - user line
 * @returns true for a human prompt
 */
function isHumanPrompt(line: Json): boolean {
  if (line.isMeta === true || line.isSidechain === true || line.isCompactSummary === true) return false;
  const origin = isObject(line.origin) ? line.origin.kind : undefined;
  return origin === 'human' || line.turnOrigin === 'human';
}

/**
 * A tool-result event; the spawned agent id is attached when the line answers a single call.
 * @param block - tool_result block
 * @param line - the user line holding it
 * @param at - line timestamp
 * @param count - number of results on the line
 * @returns event
 */
function toolResultEvent(block: Json, line: Json, at: string, count: number): WorldEvent {
  const event: WorldEvent = { kind: 'toolResult', at, toolUseId: String(block.tool_use_id ?? ''), isError: block.is_error === true };
  const agentId = isObject(line.toolUseResult) ? line.toolUseResult.agentId : undefined;
  return count === 1 && typeof agentId === 'string' ? { ...event, agentId } : event;
}

/**
 * Events from an assistant line: thinking, text and tool calls, in block order.
 * @param line - assistant line
 * @param at - line timestamp
 * @returns events
 */
function assistantEvents(line: Json, at: string): WorldEvent[] {
  const message = isObject(line.message) ? line.message : {};
  const blocks = Array.isArray(message.content) ? message.content.filter(isObject) : [];
  const final = message.stop_reason === 'end_turn';
  const model = typeof message.model === 'string' && message.model !== SYNTHETIC_MODEL ? message.model : undefined;
  const effort = typeof line.effort === 'string' && line.effort ? line.effort : undefined;
  const meta: WorldEvent[] = model || effort ? [{ kind: 'meta', at, ...(model ? { model } : {}), ...(effort ? { effort } : {}) }] : [];
  return [...meta, ...blocks.flatMap((block): WorldEvent[] => {
    if (block.type === 'thinking') return [{ kind: 'thinking', at }];
    if (block.type === 'text' && typeof block.text === 'string') return [{ kind: 'text', at, text: block.text, final }];
    if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') return [toolEvent(block, at)];
    return [];
  })];
}

/**
 * A tool-call event with its summary, file change and spawn request where they apply.
 * @param block - tool_use block
 * @param at - line timestamp
 * @returns event
 */
function toolEvent(block: Json, at: string): WorldEvent {
  const tool = String(block.name);
  const input = isObject(block.input) ? block.input : {};
  const change = changeOf(tool, input);
  const spawn = SPAWN_TOOLS.has(tool) ? spawnOf(input) : undefined;
  return {
    kind: 'tool',
    at,
    toolUseId: String(block.id),
    tool,
    summary: summarizeTool(tool, input),
    ...(change ? { change } : {}),
    ...(spawn ? { spawn } : {}),
  };
}

/**
 * The file change a tool call makes, if it edits or writes a file.
 * @param tool - tool name
 * @param input - tool input
 * @returns change, or undefined
 */
function changeOf(tool: string, input: Json): FileChange | undefined {
  const text = (key: string): string => (typeof input[key] === 'string' ? (input[key] as string) : '');
  if (tool === 'Edit') return { file: text('file_path'), op: 'edit', oldText: text('old_string'), newText: text('new_string') };
  if (tool === 'Write') return { file: text('file_path'), op: 'write', oldText: '', newText: text('content') };
  if (tool === 'NotebookEdit') return { file: text('notebook_path'), op: 'edit', oldText: '', newText: text('new_source') };
  if (tool === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits.filter(isObject) : [];
    const pick = (key: string): string => edits.map((edit) => (typeof edit[key] === 'string' ? edit[key] : '')).join('\n');
    return { file: text('file_path'), op: 'edit', oldText: pick('old_string'), newText: pick('new_string') };
  }
  return undefined;
}

/**
 * The subagent an Agent tool call asks for.
 * @param input - Agent tool input
 * @returns spawn request
 */
function spawnOf(input: Json): SpawnRequest {
  const text = (key: string): string => (typeof input[key] === 'string' ? (input[key] as string) : '');
  const spawn: SpawnRequest = { role: text('subagent_type') || 'general-purpose', description: text('description'), instruction: text('prompt') };
  return text('model') ? { ...spawn, model: text('model') } : spawn;
}

/**
 * Narrow an unknown value to a plain object.
 * @param value - any value
 * @returns true when it is a non-null, non-array object
 */
function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
