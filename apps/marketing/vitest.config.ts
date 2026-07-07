import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Unit tests — including the DESIGN-LINT gate (tests/design-lint.test.ts), which compiles
 * docs/design/marketing-design.manifest.json into hard failures. Node environment: these
 * tests scan source files; component e2e runs under Playwright.
 */
export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
  },
});
