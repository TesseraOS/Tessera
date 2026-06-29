import { describe, expect, it } from 'vitest';
import { loadConfig } from './load.js';
import { configSchema } from './schema.js';

describe('config schema + loader', () => {
  it('applies defaults for an empty environment', () => {
    const config = loadConfig({});
    expect(config.profile).toBe('local');
    expect(config.env).toBe('development');
    expect(config.storage.sqlitePath).toContain('.tessera');
    expect(config.embeddings.provider).toBe('transformers');
    expect(config.budgets.defaultContextTokens).toBe(8000);
    expect(config.secrets).toMatchObject({ provider: 'env', envPrefix: 'TESSERA_SECRET_' });
  });

  it('applies TESSERA_* environment overrides (with number coercion)', () => {
    const config = loadConfig({
      TESSERA_SQLITE_PATH: ':memory:',
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '16',
      TESSERA_CONTEXT_BUDGET: '1234',
      TESSERA_SECRETS_PROVIDER: 'file',
      TESSERA_SECRETS_FILE: './secrets.json',
    });
    expect(config.storage.sqlitePath).toBe(':memory:');
    expect(config.embeddings).toMatchObject({ provider: 'fake', dimension: 16 });
    expect(config.budgets.defaultContextTokens).toBe(1234);
    expect(config.secrets).toMatchObject({ provider: 'file', file: './secrets.json' });
  });

  it('lets explicit overrides win over the environment (merged per section)', () => {
    const config = loadConfig(
      { TESSERA_LOG_LEVEL: 'debug', TESSERA_RETRIEVAL_LIMIT: '99' },
      { logLevel: 'warn', budgets: { retrievalLimit: 5 } },
    );
    expect(config.logLevel).toBe('warn');
    expect(config.budgets.retrievalLimit).toBe(5);
  });

  it('rejects invalid values with a typed ValidationError', () => {
    expect(() => loadConfig({ TESSERA_EMBEDDINGS_PROVIDER: 'bogus' })).toThrow(
      /invalid configuration/,
    );
    expect(() => loadConfig({ TESSERA_CONTEXT_BUDGET: 'notanumber' })).toThrow(
      /invalid configuration/,
    );
  });

  it('configSchema resolves a minimal object to defaults', () => {
    expect(configSchema.parse({}).budgets.retrievalLimit).toBe(20);
  });
});
