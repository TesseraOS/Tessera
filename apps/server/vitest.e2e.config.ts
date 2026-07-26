import { defineConfig } from 'vitest/config';

/**
 * E2E over the real composition root (ADR-0014: app e2e in `apps/* /tests/e2e`). Gate 6 (`test:e2e`).
 * Booting a real runtime + a real MCP client is slower than the unit budget allows.
 */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
