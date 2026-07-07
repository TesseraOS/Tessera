import { defineConfig, devices } from '@playwright/test';

const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E + accessibility (axe, WCAG 2.1 AA) over the marketing site. Backs the `a11y` gate
 * (NFR-9) and the MARKETING-DESIGN.md review protocol. Port 3200 — distinct from the
 * dashboard's 3100 so `pnpm -w test:e2e` can run both apps in parallel.
 */
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
  // Serve the production build (static pages) so tests exercise what ships.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
