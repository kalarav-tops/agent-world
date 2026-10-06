import type { ScientistStatus } from './types.js';

/** A place inside a lab where a scientist does a kind of work. */
export type Station = 'bench' | 'microscope' | 'terminal' | 'library' | 'portal' | 'helpdesk' | 'whiteboard' | 'exit' | 'lounge';

const MAX_SUMMARY = 120;

const STATION_BY_TOOL: Record<string, Station> = {
  Edit: 'bench',
  MultiEdit: 'bench',
  Write: 'bench',
  NotebookEdit: 'bench',
  Read: 'microscope',
  Grep: 'microscope',
  Glob: 'microscope',
  LSP: 'microscope',
  ToolSearch: 'microscope',
  Bash: 'terminal',
  PowerShell: 'terminal',
  Monitor: 'terminal',
  WebFetch: 'library',
  WebSearch: 'library',
  Agent: 'portal',
  Task: 'portal',
  SendMessage: 'portal',
  TaskCreate: 'portal',
  TaskUpdate: 'portal',
  TaskStop: 'portal',
  Workflow: 'portal',
  AskUserQuestion: 'helpdesk',
};

/**
 * The last segment of a file path, for posix or windows separators.
 * @param path - file path
 * @returns file name
 */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}

/**
 * A short, human-readable description of a tool call.
 * @param tool - tool name
 * @param input - tool input
 * @returns summary, at most 120 characters
 */
export function summarizeTool(tool: string, input: Record<string, unknown>): string {
  return truncate(describe(tool, input) || tool);
}

/**
 * Where in the lab a scientist stands for a status and tool.
 * @param status - scientist status
 * @param tool - tool being run, if any
 * @returns the station
 */
export function stationFor(status: ScientistStatus, tool: string | undefined): Station {
  if (status === 'done' || status === 'interrupted' || status === 'idle') return 'lounge';
  if (status === 'thinking' || !tool) return 'whiteboard';
  if (tool.startsWith('mcp__')) return 'library';
  return STATION_BY_TOOL[tool] ?? 'whiteboard';
}

/**
 * Pick the most telling input field for a tool.
 * @param tool - tool name
 * @param input - tool input
 * @returns description, possibly empty
 */
function describe(tool: string, input: Record<string, unknown>): string {
  const text = (key: string): string => (typeof input[key] === 'string' ? (input[key] as string) : '');
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return text('description') || (text('command').split('\n')[0] ?? '');
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return baseName(text('file_path'));
    case 'NotebookEdit':
      return baseName(text('notebook_path'));
    case 'Grep':
      return `"${text('pattern')}"${text('path') ? ` in ${baseName(text('path'))}` : ''}`;
    case 'Glob':
      return text('pattern');
    case 'WebSearch':
      return text('query');
    case 'WebFetch':
      return hostOf(text('url'));
    case 'Agent':
    case 'Task':
      return text('description');
    case 'Skill':
      return text('skill');
    case 'AskUserQuestion':
      return firstQuestion(input.questions);
    case 'SendMessage':
      return text('to') ? `to ${text('to')}` : '';
    default:
      return tool.startsWith('mcp__') ? mcpLabel(tool) : text('subject') || text('description');
  }
}

/**
 * The host of a URL, or the text itself when it is not a URL.
 * @param url - URL text
 * @returns host
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * The first question text of an AskUserQuestion input.
 * @param questions - the questions input
 * @returns question text, possibly empty
 */
function firstQuestion(questions: unknown): string {
  if (!Array.isArray(questions)) return '';
  const first: unknown = questions[0];
  if (first && typeof first === 'object' && typeof (first as { question?: unknown }).question === 'string') {
    return (first as { question: string }).question;
  }
  return '';
}

/**
 * `mcp__server__tool` shown as `server: tool`.
 * @param tool - MCP tool name
 * @returns label
 */
function mcpLabel(tool: string): string {
  const [, server = '', ...rest] = tool.split('__');
  return `${server}: ${rest.join('__')}`;
}

/**
 * Cut text to the summary length.
 * @param text - text
 * @returns truncated text
 */
function truncate(text: string): string {
  return text.length > MAX_SUMMARY ? text.slice(0, MAX_SUMMARY) : text;
}
