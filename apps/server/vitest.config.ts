import { defineConfig } from 'vitest/config';

/** Unit tests live beside the source they cover (ADR-0014). E2E runs under vitest.e2e.config.ts. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
