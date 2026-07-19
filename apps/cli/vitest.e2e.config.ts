import { defineConfig } from 'vitest/config';

/**
 * Integration tests that boot the real Local runtime in temp dirs (F-052 acceptance). They live under
 * `tests/e2e/` and are slower than the beside-source unit tests, so they run under their own config
 * (and a longer timeout for the first embedding/model wiring).
 */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
