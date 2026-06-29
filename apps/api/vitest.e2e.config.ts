import { defineConfig } from 'vitest/config';

/** E2E tests over the HTTP surface (ADR-0014: app e2e in apps/* /tests/e2e). Gate 6 (`test:e2e`). */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
  },
});
