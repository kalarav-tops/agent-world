/** A normalized, typed event extracted from one transcript line. */
export type WorldEvent =
  | { kind: 'prompt'; at: string; text: string; promptId: string }
  | { kind: 'thinking'; at: string }
  | { kind: 'text'; at: string; text: string; final: boolean }
  | { kind: 'tool'; at: string; toolUseId: string; tool: string; summary: string; change?: FileChange; spawn?: SpawnRequest }
  | { kind: 'toolResult'; at: string; toolUseId: string; isError: boolean; agentId?: string }
  | { kind: 'interrupt'; at: string }
  | { kind: 'meta'; at: string; model?: string; effort?: string };

/** A file edit or write made by a tool call. */
export interface FileChange {
  file: string;
  op: 'edit' | 'write';
  oldText: string;
  newText: string;
}

/** What an Agent tool call asked for. */
export interface SpawnRequest {
  role: string;
  description: string;
  instruction: string;
  model?: string;
}

export type ScientistStatus = 'thinking' | 'working' | 'asking' | 'done' | 'interrupted' | 'idle';

/** The action a scientist is performing right now. */
export interface CurrentAction {
  toolUseId: string;
  tool: string;
  summary: string;
  since: string;
}

/** One finished or running action in a scientist's feed. */
export interface ActionEntry {
  at: string;
  toolUseId: string;
  tool: string;
  summary: string;
  state: 'running' | 'ok' | 'error';
}

/** One entry of a lab's replay timeline. */
export interface TimelineEntry {
  at: string;
  scientistId: string;
  status: ScientistStatus;
  tool?: string;
  summary?: string;
}

/** A change recorded on a lab's changes board. */
export interface ChangeEntry extends FileChange {
  at: string;
  scientistId: string;
  toolUseId: string;
  truncated?: boolean;
}

/** An agent (main or subagent) working in a lab. */
export interface Scientist {
  id: string;
  role: string;
  description: string;
  instruction: string;
  parentId: string | null;
  depth: number;
  model: string;
  effort: string;
  status: ScientistStatus;
  current: CurrentAction | null;
  actions: ActionEntry[];
  report: string;
  lastText: string;
  startedAt: string;
  updatedAt: string;
}

/** One human prompt and all the work done for it. */
export interface Lab {
  id: string;
  index: number;
  prompt: string;
  startedAt: string;
  updatedAt: string;
  scientists: Record<string, Scientist>;
  changes: ChangeEntry[];
  timeline: TimelineEntry[];
  version: number;
}

/** Live-session metadata read from the session registry. */
export interface SessionInfo {
  sessionId: string;
  pid: number;
  cwd: string;
  kind: string;
  entrypoint: string;
  startedAt: number;
}

/** A live session: one continent. */
export interface Session extends SessionInfo {
  project: string;
  branch: string;
  title: string;
  labs: Lab[];
  pendingSpawns: Record<string, { labId: string; parentId: string; spawn: SpawnRequest }>;
  agentLabs: Record<string, string>;
}

/** Light per-scientist data streamed to the browser. */
export interface ScientistSummary {
  id: string;
  role: string;
  description: string;
  status: ScientistStatus;
  current: CurrentAction | null;
  parentId: string | null;
  depth: number;
  model: string;
  effort: string;
  changeCount: number;
  updatedAt: string;
}

/** Light per-lab data streamed to the browser. */
export interface LabSummary {
  id: string;
  index: number;
  prompt: string;
  startedAt: string;
  updatedAt: string;
  active: boolean;
  changeCount: number;
  scientists: ScientistSummary[];
  version: number;
}

/** Light per-session data streamed to the browser. */
export interface SessionSummary {
  sessionId: string;
  pid: number;
  cwd: string;
  project: string;
  branch: string;
  title: string;
  kind: string;
  entrypoint: string;
  startedAt: number;
  labs: LabSummary[];
}

/** The whole world as streamed to the browser. */
export interface WorldSummary {
  generatedAt: string;
  sessions: SessionSummary[];
  control?: ControlState;
}

/** Message sent over the WebSocket. */
export interface WorldMessage {
  type: 'world';
  world: WorldSummary;
}

/** One option of a question an agent asks. */
export interface QuestionOption {
  label: string;
  description: string;
}

/** One question inside an AskUserQuestion call. */
export interface AgentQuestion {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

/** Something an agent is waiting on you for, raised by the Agent World hook. */
export type PendingRequest =
  | { id: string; kind: 'question'; sessionId: string; createdAt: string; expiresAt: string; questions: AgentQuestion[] }
  | { id: string; kind: 'permission'; sessionId: string; createdAt: string; expiresAt: string; tool: string; summary: string; detail: string; truncated: boolean };

/** A prompt run started from the command centre. */
export interface ControlRun {
  id: string;
  sessionId: string | null;
  cwd: string;
  prompt: string;
  startedAt: string;
  state: 'running' | 'finished' | 'failed';
  exitCode: number | null;
}

/** Command-centre state streamed with the world. */
export interface ControlState {
  enabled: boolean;
  requests: PendingRequest[];
  runs: ControlRun[];
}

/** A project a fresh conversation can start in, as the browser sees it (never a path). */
export interface ProjectView {
  id: string;
  name: string;
  branch: string;
  live: boolean;
}
