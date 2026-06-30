import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

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
  // Serve the production build (prebuilt static pages) so tests don't race the dev compiler.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
