import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(packageRoot, '../../apps/web');

/**
 * Ports are dedicated to this suite (the web e2e owns 3000/3100), so `e2e` and `e2e-full` can run
 * back-to-back in one CI job without colliding.
 */
const API_PORT = Number(process.env.E2E_FULL_API_PORT ?? 3200);
const WEB_PORT = Number(process.env.E2E_FULL_WEB_PORT ?? 3201);
const apiUrl = `http://127.0.0.1:${API_PORT}`;
const baseURL = `http://localhost:${WEB_PORT}`;

/**
 * The **full-stack** gate (F-048; NFR-16) — the only suite that proves the whole product works as one
 * deployment: a real server over real adapters with a real repository ingested, driven by the real
 * dashboard (human journey) and the real MCP binary (agent journey), both against the same data.
 *
 * **Serialized on purpose** (`workers: 1`, `fullyParallel: false`): the two journeys write to one
 * SQLite deployment, and this gate's job is to be trustworthy, not fast. It is `requiredFor: release`,
 * not a per-commit gate.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // A real boot + ingest + browser + MCP process: allow more than the default per test.
  timeout: 90_000,
  // No retries: a flaky full-stack gate is a lie. A failure here is a finding, not noise to paper over.
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    // 1. The REAL Tessera server (startApiServer — the shipped entry), Local profile over file-backed
    //    SQLite in a temp dir, with the fixture repo registered + scanned before it reports healthy.
    {
      command: 'node support/full-stack-server.mjs',
      url: `${apiUrl}/health`,
      cwd: packageRoot,
      env: { E2E_FULL_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    // 2. The REAL dashboard (production build), pointed at that live API through its proxy (ADR-0048)
    //    — not its own stub server. This is the distinction from the web e2e suite.
    {
      command: `pnpm build && pnpm start --port ${WEB_PORT}`,
      url: baseURL,
      cwd: webRoot,
      env: { TESSERA_API_URL: apiUrl },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
