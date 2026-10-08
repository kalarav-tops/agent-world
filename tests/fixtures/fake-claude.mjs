#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A stand-in for `claude -p` in end-to-end tests: it writes a two-line transcript (the prompt and a
 * fixed reply) for the session id it was given, in the folder FAKE_CLAUDE_DIR points at, and exits.
 * It never calls a model.
 */
const args = process.argv.slice(2);
const flag = args.indexOf('--session-id');
const sessionId = flag >= 0 ? args[flag + 1] : undefined;
const prompt = args.at(-1) ?? '';
const claudeDir = process.env.FAKE_CLAUDE_DIR;
if (claudeDir && sessionId) {
  const folder = join(claudeDir, 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));
  mkdirSync(folder, { recursive: true });
  const now = new Date().toISOString();
  const lines = [
    { type: 'user', isSidechain: false, promptId: 'fake-1', uuid: 'fake-u1', origin: { kind: 'human' }, cwd: process.cwd(), message: { role: 'user', content: [{ type: 'text', text: prompt }] }, timestamp: now },
    { type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Fake reply: done.' }] }, timestamp: now },
  ];
  writeFileSync(join(folder, `${sessionId}.jsonl`), lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
}
