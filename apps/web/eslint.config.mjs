// Flat ESLint config for @tessera/web. Mirrors the root config (recommended + prettier) and
// adds React-hooks + jsx-a11y (the latter backs part of the NFR-9 accessibility bar).
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
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Node-run E2E support scripts (real test servers) use Node globals, not the browser env.
    files: ['tests/e2e/support/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    // Playwright fixtures call `use(...)` — not a React hook; silence the false positive.
    files: ['tests/e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // A scrollable LIST must be keyboard-reachable. Where its rows are not focusable (the Overview's
    // activity feed), `tabIndex={0}` on the list is the only thing that lets a keyboard user scroll
    // it at all — axe enforces exactly that as `scrollable-region-focusable` (WCAG 2.1.1), and our
    // e2e a11y gate runs it. jsx-a11y's heuristic forbids the same attribute, so the two genuinely
    // conflict; the WCAG-backed one wins.
    //
    // Narrowed on purpose — this does NOT open tabIndex up to arbitrary non-interactive elements,
    // which is what the rule is actually there to prevent. Two allowances, both scrollable regions:
    //   `ul`     — the Overview's activity feed (F-080). Allowed by TAG because `roles: ['list']`
    //              does not work: the rule will not resolve a `ul`'s implicit role, and stating
    //              `role="list"` to satisfy it then trips `no-redundant-roles`. The two jsx-a11y
    //              rules cannot both be satisfied on that element.
    //   `region` — the graph's node panel (F-082), whose Effects mode contains nothing focusable.
    //              An explicit `role="region"` on a `div` is not redundant, so this one resolves.
    files: ['**/*.tsx'],
    rules: {
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: ['ul'], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
    },
  },
  prettier,
);
