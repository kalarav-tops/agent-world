import { defineConfig } from '@playwright/test';

/**
 * E2E runs the built server (`npm run build` first) against a fixture Claude folder.
 * Set PW_CHROMIUM_PATH to use an already-installed Chromium instead of `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
