// Flat ESLint config for @tessera/marketing. Mirrors @tessera/web (recommended + prettier,
// React-hooks + jsx-a11y — the latter backs part of the NFR-9 accessibility bar).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    // Disambiguate the TSConfig root in this monorepo (typescript-eslint#10841).
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Dev utilities (brand renderer): Node process + browser code inside page.evaluate().
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', document: 'readonly' },
    },
  },
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Scrollable regions (e.g. <pre> code blocks) must be keyboard-focusable per WCAG
      // 2.1.1 (axe: scrollable-region-focusable). Allow tabIndex when marked role="region".
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],
    },
  },
  prettier,
);
