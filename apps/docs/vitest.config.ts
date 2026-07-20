import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Unit tests — including the DESIGN-LINT gate (tests/design-lint.test.ts, compiling
 * docs/design/docs-design.manifest.json into hard failures) and the generated-data
 * drift gate. Node environment: these tests scan source files; page e2e runs under
 * Playwright.
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
