#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Engine } from './engine.js';
import { startServer } from './http.js';
import { randomBytes } from 'node:crypto';
import { ControlService } from './control.js';
import { findClaude, processRunner } from './claude-runner.js';
import { removeLauncher, removeServerFile, writeLauncher, writeServerFile } from './server-file.js';
import { ProjectCatalog } from './projects.js';
import { SHIP_LOG_FILE } from './ship-log.js';

const DEFAULT_PORT = 4317;
const DEFAULT_POLL_MS = 750;
const SHUTDOWN_LIMIT_MS = 5_000;

const USAGE = `agent-world — a live 3D world of your Claude Code agents (read-only, zero tokens)

Usage: agent-world [options]
       agent-world hooks        print the Claude Code hook settings for answering agents from the world

  --port <n>          port on 127.0.0.1 (default ${DEFAULT_PORT}; 0 picks a free port)
  --claude-dir <dir>  Claude Code config folder (default $CLAUDE_CONFIG_DIR or ~/.claude)
  --poll <ms>         how often to check for activity (default ${DEFAULT_POLL_MS})
  --dev-origin <url>  extra WebSocket origin to allow, e.g. http://localhost:5173 for the Vite dev server
  --open              open the world in your browser
  --allow-control     turn on the command centre: send prompts, ask agents what they did, and
                      answer agent questions from the world (uses your Claude usage for those actions)
  --claude-bin <path> the claude executable to use (default: found on PATH or ~/.local/bin)
  -h, --help          show this help
`;

/**
 * Parse arguments, start the engine and the server, and stop cleanly on Ctrl+C.
 */
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: 'string' },
      'claude-dir': { type: 'string' },
      poll: { type: 'string' },
      'dev-origin': { type: 'string', multiple: true },
      open: { type: 'boolean' },
      'allow-control': { type: 'boolean' },
      'claude-bin': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (positionals[0] === 'hooks') {
    process.stdout.write(hookSettings());
    return;
  }

  const port = values.port === '0' ? 0 : parsePositive(values.port, DEFAULT_PORT, 'port');
  const pollMs = parsePositive(values.poll, DEFAULT_POLL_MS, 'poll');
  const claudeDir = resolve(values['claude-dir'] ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'));
  const webDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
  if (!existsSync(join(webDir, 'index.html'))) {
    process.stderr.write(`agent-world: UI not built (${webDir}). Run "npm run build" first.\n`);
  }

  const engine = new Engine({ claudeDir });
  const allowControl = values['allow-control'] === true;
  const claudeBin = allowControl ? findClaude(values['claude-bin']) : null;
  const token = randomBytes(24).toString('hex');
  const projects = new ProjectCatalog({ claudeDir, live: () => engine.liveProjects() });
  const control = new ControlService({ enabled: allowControl, engine, runner: claudeBin ? processRunner(claudeBin) : null, projects, logFile: SHIP_LOG_FILE });
  const server = await startServer({ engine, port, webDir, extraOrigins: values['dev-origin'] ?? [], control, token });
  engine.start(pollMs);
  process.on('exit', () => {
    control.kill();
    removeServerFile();
    removeLauncher();
  });
  if (allowControl) writeServerFile(server.port, token);

  const url = `http://127.0.0.1:${server.port}/#token=${token}`;
  process.stdout.write(`agent-world: watching ${claudeDir}\nagent-world: open ${url}\n`);
  process.stdout.write('agent-world: the link carries this run\'s access key; it changes every start, so keep it to yourself.\n');
  if (allowControl) process.stdout.write(controlNotice(claudeBin));
  if (values.open) openBrowser(writeLauncher(url), url);

  const shutdown = async (): Promise<void> => {
    engine.stop();
    removeServerFile();
    const finished = Promise.all([control.stop(), server.close()]);
    await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, SHUTDOWN_LIMIT_MS))]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGHUP', () => void shutdown());
  process.on('uncaughtException', (error) => {
    process.stderr.write(`agent-world: ${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}

/**
 * Parse a positive integer option.
 * @param raw - option text
 * @param fallback - default value
 * @param name - option name for the error message
 * @returns the number
 */
function parsePositive(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer, got "${raw}"`);
  return value;
}

/**
 * Open the launcher page in the default browser. A file path is opened rather than the keyed link,
 * because other users on the machine can read every process's command line.
 * @param launcher - launcher file path, written by this program
 * @param url - the keyed link, printed only if no browser could be opened
 */
function openBrowser(launcher: string, url: string): void {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [launcher]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', launcher]] : ['xdg-open', [launcher]];
  spawn(command, args, { stdio: 'ignore', detached: true })
    .on('error', () => process.stderr.write(`agent-world: could not open a browser; visit ${url}\n`))
    .unref();
}

main().catch((error: unknown) => {
  process.stderr.write(`agent-world: ${(error as Error).message}\n`);
  process.exit(1);
});

/**
 * The startup line describing the command centre.
 * @param claudeBin - the claude executable found, or null
 * @returns notice text
 */
function controlNotice(claudeBin: string | null): string {
  if (!claudeBin) return 'agent-world: command centre on, but no claude executable was found; pass --claude-bin <path>\n';
  return `agent-world: command centre on (claude: ${claudeBin}). Run "agent-world hooks" to answer agent questions from the world.\n`;
}

/**
 * The Claude Code settings that send agent questions and permission prompts to Agent World. Paste
 * them into ~/.claude/settings.json (or a project's .claude/settings.json).
 * @returns settings JSON text with the hook's absolute path
 */
function hookSettings(): string {
  const hook = join(dirname(fileURLToPath(import.meta.url)), 'hook.js');
  const entry = { type: 'command', command: `node ${JSON.stringify(hook)}`, timeout: 150 };
  const settings = {
    hooks: {
      PreToolUse: [{ matcher: 'AskUserQuestion', hooks: [entry] }],
      PermissionRequest: [{ matcher: '*', hooks: [entry] }],
    },
  };
  return [
    'Add this to ~/.claude/settings.json (merge it with any hooks you already have).',
    'Agent World must be running with --allow-control; otherwise the hook exits at once and nothing changes.',
    'Unanswered questions fall back to the normal dialog after 120 seconds (set AGENT_WORLD_WAIT_SECONDS to shorten).',
    '',
    JSON.stringify(settings, null, 2),
    '',
  ].join('\n');
}
