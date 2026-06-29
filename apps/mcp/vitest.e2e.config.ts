import { defineConfig } from 'vitest/config';

/** E2E drives the server through a real MCP client over a linked in-memory transport. Gate 6. */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
  },
});
