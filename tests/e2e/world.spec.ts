import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { assistantText, humanPrompt, setFixtureBase, thinking, toolResult, toolUse } from '../fixtures/lines';

const MAIN_SESSION = 'e2e-main';
const SIDE_SESSION = 'e2e-side';

let claudeDir: string;
let mainTranscript: string;
let server: ChildProcess;
let baseUrl: string;

/**
 * Serialize transcript lines as JSONL.
 * @param lines - lines
 * @returns JSONL text
 */
const jsonl = (...lines: Record<string, unknown>[]): string => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/**
 * Register a live session owned by this (alive) test process, with its transcript.
 * @param sessionId - session id
 * @param cwd - working directory
 * @param registryName - registry file name
 * @param lines - transcript lines
 * @returns transcript path
 */
const addSession = (sessionId: string, cwd: string, registryName: string, lines: Record<string, unknown>[]): string => {
  writeFileSync(
    join(claudeDir, 'sessions', registryName),
    JSON.stringify({ pid: process.pid, sessionId, cwd, kind: 'interactive', entrypoint: 'cli', startedAt: registryName === 'a.json' ? 1 : 2 }),
  );
  const projectDir = join(claudeDir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  mkdirSync(join(projectDir, sessionId, 'subagents'), { recursive: true });
  const transcript = join(projectDir, `${sessionId}.jsonl`);
  writeFileSync(transcript, jsonl(...lines));
  return transcript;
};

test.beforeAll(async () => {
  setFixtureBase(Date.now() + 120_000);
  claudeDir = mkdtempSync(join(tmpdir(), 'agent-world-e2e-'));
  mkdirSync(join(claudeDir, 'sessions'));
  mainTranscript = addSession(MAIN_SESSION, '/work/shop-app', 'a.json', [
    { type: 'ai-title', aiTitle: 'Fix flaky login test' },
    humanPrompt('Fix the flaky login test'),
    toolUse('a1', 'Agent', { subagent_type: 'Explore', description: 'Find flaky test', prompt: 'Find why login.spec.ts flakes' }),
    toolResult('a1', 2, { toolUseResult: { agentId: 'ag1' } }),
    toolUse('e1', 'Edit', { file_path: '/work/shop-app/login.spec.ts', old_string: 'await page.click(login)', new_string: 'await page.click(login);\nawait expect(home).toBeVisible()' }, 3),
  ]);
  const subDir = join(claudeDir, 'projects', '-work-shop-app', MAIN_SESSION, 'subagents');
  writeFileSync(join(subDir, 'agent-ag1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Find flaky test', toolUseId: 'a1', spawnDepth: 1 }));
  writeFileSync(join(subDir, 'agent-ag1.jsonl'), jsonl(thinking(2), toolUse('g1', 'Grep', { pattern: 'login' }, 3)));
  addSession(SIDE_SESSION, '/work/docs-site', 'b.json', [humanPrompt('Update the README'), assistantText('README updated')]);

  server = spawn(process.execPath, ['dist/server/cli.js', '--port', '0', '--claude-dir', claudeDir, '--poll', '200'], { stdio: ['ignore', 'pipe', 'inherit'] });
  baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 15_000);
    server.stdout?.on('data', (chunk: Buffer) => {
      const match = /open (http:\/\/127\.0\.0\.1:\d+\/#token=[0-9a-f]+)/.exec(chunk.toString());
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
});

test.afterAll(() => {
  server?.kill();
  rmSync(claudeDir, { recursive: true, force: true });
});

test('shows every live session as a continent with live counts', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('.hud__stats')).toContainText('2 sessions');
  await expect(page.locator('.hud__stats')).toContainText('1 edit');
  await expect(page.getByRole('navigation', { name: 'Sessions' }).getByRole('button')).toHaveCount(2);
  await expect(page.locator('.continent-tag')).toHaveCount(2);
  await expect(page.locator('.continent-tag').first()).toContainText('Fix flaky login test');
});

test('opens a lab, inspects a subagent and reads a diff', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('.lab-tag--lit').first().click();
  const panel = page.getByRole('complementary');
  await expect(panel.locator('.prompt')).toHaveText('Fix the flaky login test');

  await panel.getByRole('button', { name: /Explore/ }).click();
  await expect(panel.locator('.prompt')).toHaveText('Find why login.spec.ts flakes');
  await expect(panel.locator('.status-line')).toContainText('Working: "login"');

  await panel.getByRole('button', { name: 'Back to lab' }).click();
  await panel.getByRole('button', { name: /1 file change/ }).click();
  await panel.getByRole('button', { name: /login\.spec\.ts/ }).click();
  await expect(panel.locator('.diff__totals')).toContainText('2 added, 1 removed');
  await expect(panel.locator('.diff__line--add').first()).toContainText('await page.click(login);');
});

test('replays a lab and returns to live', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('.lab-tag--lit').first().click();
  const panel = page.getByRole('complementary');
  await panel.getByRole('button', { name: 'Replay this lab' }).click();
  const scrub = panel.getByRole('slider', { name: 'Replay position' });
  await expect(scrub).toBeVisible();
  await expect(panel.locator('.replay__clock')).toHaveText('0:03 / 0:03');
  await panel.getByRole('button', { name: '16×' }).click();
  await expect(panel.getByRole('button', { name: '16×' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Play' }).click();
  await expect(panel.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(panel.locator('.replay__clock')).toHaveText('0:03 / 0:03');
  await panel.getByRole('button', { name: 'Back to live' }).click();
  await expect(panel.getByRole('button', { name: 'Replay this lab' })).toBeVisible();
});

test('explains how to turn on the command centre when it is off', async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /Command centre/ }).click();
  const drawer = page.getByRole('complementary', { name: 'Command centre' });
  await expect(drawer).toContainText('The command centre is off');
  await expect(drawer).toContainText('--allow-control');
  await drawer.getByRole('button', { name: 'Close command centre' }).click();
  await expect(drawer).toHaveCount(0);
});

test('takes the access key out of the address bar and keeps working after a reload', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('.hud__stats')).toContainText('2 sessions');
  expect(page.url()).not.toContain('token');
  await page.reload();
  await expect(page.locator('.hud__stats')).toContainText('2 sessions');
});

test('asks for the access link when opened without it', async ({ page }) => {
  await page.goto(baseUrl.replace(/#token=.*/, ''));
  await expect(page.getByRole('alert')).toContainText('This page needs its access link');
  await expect(page.locator('.hud__stats')).toHaveCount(0);
});

test('closes the panel with Escape', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('.lab-tag').first().click();
  await expect(page.getByRole('complementary')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary')).toHaveCount(0);
});

test('updates live as agents work and removes a closed session', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('.lab-tag--lit').first().click();
  const panel = page.getByRole('complementary');
  const mainRow = panel.getByRole('button', { name: /Main agent/ });
  await expect(mainRow).toContainText('Working');

  appendFileSync(mainTranscript, jsonl(toolResult('e1', 4), assistantText('The login test is stable now', true, 5)));
  await expect(mainRow).toContainText('Done');

  rmSync(join(claudeDir, 'sessions', 'b.json'));
  await expect(page.locator('.hud__stats')).toContainText('1 session');
  await expect(page.locator('.continent-tag')).toHaveCount(1);
});
