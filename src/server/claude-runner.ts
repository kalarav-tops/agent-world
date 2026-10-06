import { spawn, type ChildProcess } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** A started prompt run. */
export interface RunHandle {
  done: Promise<number>;
  output: () => string;
}

/** Launches `claude`; swapped for a fake in tests. */
export interface ClaudeRunner {
  start: (args: string[], cwd: string, timeoutMs: number) => RunHandle;
  ask: (args: string[], cwd: string, timeoutMs: number) => Promise<string>;
  stop: () => Promise<void>;
  kill: () => void;
}

const OUTPUT_TAIL = 4000;
const KILL_GRACE_MS = 3_000;
const OWN_GROUP = process.platform !== 'win32';

/**
 * Find the `claude` executable: an explicit path, then PATH, then the usual install locations
 * (the installer often adds only a shell alias, which a server process cannot see).
 * @param explicit - path given by flag or environment
 * @returns the executable path, or null when none is found
 */
export function findClaude(explicit?: string): string | null {
  const candidates = [
    explicit,
    ...(process.env.PATH ?? '').split(delimiter).map((folder) => join(folder, 'claude')),
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.claude', 'local', 'claude'),
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate) && isExecutable(candidate as string)) ?? null;
}

/**
 * The real runner: spawns `claude` with an argument list (never through a shell), each in its own
 * process group so stopping it also stops the commands it started. A child past its time limit gets
 * SIGTERM, then SIGKILL if it is still there after a grace period; shutdown does the same for all.
 * @param binary - path to the claude executable
 * @returns runner
 */
export function processRunner(binary: string): ClaudeRunner {
  const children = new Set<ChildProcess>();
  const launch = (args: string[], cwd: string): ChildProcess => {
    const child = spawn(binary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, detached: OWN_GROUP });
    children.add(child);
    child.on('close', () => children.delete(child));
    child.on('error', () => children.delete(child));
    return child;
  };
  return {
    start(args, cwd, timeoutMs) {
      let tail = '';
      const child = launch(args, cwd);
      const keep = (chunk: Buffer): void => {
        tail = (tail + chunk.toString()).slice(-OUTPUT_TAIL);
      };
      const timer = setTimeout(() => {
        keep(Buffer.from(`\nStopped after ${Math.round(timeoutMs / 60_000)} minutes.`));
        terminate(child);
      }, timeoutMs);
      child.stdout?.on('data', keep);
      child.stderr?.on('data', keep);
      const done = new Promise<number>((resolve) => {
        child.on('error', (error) => {
          clearTimeout(timer);
          keep(Buffer.from(`\n${error.message}`));
          resolve(-1);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve(code ?? -1);
        });
      });
      return { done, output: () => tail };
    },
    ask(args, cwd, timeoutMs) {
      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const child = launch(args, cwd);
        const timer = setTimeout(() => {
          timedOut = true;
          terminate(child);
        }, timeoutMs);
        child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-OUTPUT_TAIL)));
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (timedOut) reject(new Error('The session took too long to answer.'));
          else if (code !== 0) reject(new Error(stderr.trim().split('\n').at(-1) || `claude exited with code ${code}`));
          else resolve(readResult(stdout));
        });
      });
    },
    async stop() {
      const running = [...children];
      await Promise.all(running.map((child) => new Promise<void>((resolve) => {
        child.once('close', () => resolve());
        terminate(child);
      })));
    },
    kill() {
      children.forEach((child) => signalGroup(child, 'SIGKILL'));
    },
  };
}

/**
 * Stop a child and everything it started: SIGTERM, then SIGKILL after a grace period. The SIGKILL
 * goes to the group even when `claude` itself has already exited, so commands it left behind that
 * ignore SIGTERM are stopped too.
 * @param child - child process
 */
function terminate(child: ChildProcess): void {
  signalGroup(child, 'SIGTERM');
  setTimeout(() => signalGroup(child, 'SIGKILL'), KILL_GRACE_MS).unref();
}

/**
 * Signal a child's whole process group (or just the child where groups are not available).
 * @param child - child process
 * @param signal - signal to send
 */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  if (!OWN_GROUP) {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') process.stderr.write(`agent-world: could not stop claude (pid ${child.pid}): ${(error as Error).message}\n`);
  }
}

/**
 * The answer text from `claude -p --output-format json` output.
 * @param stdout - raw output
 * @returns the result text, or the raw output when it is not the expected JSON
 */
export function readResult(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as { result?: unknown };
    return typeof parsed.result === 'string' ? parsed.result : stdout.trim();
  } catch {
    return stdout.trim();
  }
}

/**
 * Whether a path is an executable file.
 * @param path - file path
 * @returns true when executable
 */
function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
