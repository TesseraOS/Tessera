import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const TOKEN_API_PORT = 3000;
const baseURL = `http://localhost:${PORT}`;
const tokenApiUrl = `http://127.0.0.1:${TOKEN_API_PORT}`;

/** E2E + accessibility (axe) over the running dashboard. Backs the `a11y` gate (NFR-9). */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    // A REAL token-mode Tessera API (F-045) — the dashboard proxy forwards to it; `auth.spec.ts`
    // drives the real sign-in flow against it. In-memory + fake embeddings, so it is offline/CI-safe.
    {
      command: 'node tests/e2e/support/token-api-server.mjs',
      url: `${tokenApiUrl}/health`,
      env: { TOKEN_API_PORT: String(TOKEN_API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // The dashboard (production build). Its proxy talks to the token-mode API above (ADR-0048).
    {
      command: `pnpm build && pnpm start --port ${PORT}`,
      url: baseURL,
      env: { TESSERA_API_URL: tokenApiUrl },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
