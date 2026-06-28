// Flat ESLint config for the Tessera workspace.
// Type-aware linting is layered in once real domain packages land (see F-002+);
// the scaffold uses recommended rules + the package-boundary rule (ADR-0001).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', 'logs/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Boundary enforcement (ADR-0001): never import another package's internals.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tessera/*/src/*'],
              message: 'Import a package public entry, not its src/ internals.',
            },
            {
              group: ['@tessera/*/dist/*'],
              message: 'Import a package public entry, not its dist/ output.',
            },
          ],
        },
      ],
      // TypeScript already checks undefined variables; the core no-undef rule is redundant
      // and noisy for TS (globals like Map/Set/Promise). Recommended by typescript-eslint.
      'no-undef': 'off',
    },
  },
  prettier,
);
