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

  it('defaults auth to none/free billing', () => {
    const config = loadConfig({});
    expect(config.auth.mode).toBe('none');
    expect(config.auth.tenant).toBe('default');
    expect(config.billing.provider).toBe('none');
  });

  it('accepts auth.mode=oidc with issuer + audience, and maps TESSERA_AUTH_OIDC_*', () => {
    const config = loadConfig({
      TESSERA_AUTH_MODE: 'oidc',
      TESSERA_AUTH_OIDC_ISSUER: 'https://idp.example.com',
      TESSERA_AUTH_OIDC_AUDIENCE: 'tessera-api',
    });
    expect(config.auth.mode).toBe('oidc');
    expect(config.auth.oidc).toMatchObject({
      issuer: 'https://idp.example.com',
      audience: 'tessera-api',
    });
  });

  it('rejects auth.mode=oidc without issuer/audience', () => {
    expect(() => loadConfig({ TESSERA_AUTH_MODE: 'oidc' })).toThrow(/invalid configuration/);
  });

  it('defaults the api hardening section (rate limiting off, no CORS allowlist, no HSTS)', () => {
    const config = loadConfig({});
    expect(config.api.rateLimit).toMatchObject({ enabled: false, limit: 120, windowMs: 60_000 });
    expect(config.api.cors.allowedOrigins).toEqual([]);
    expect(config.api.security.hsts).toBe(false);
  });

  it('maps TESSERA_API_* overrides (rate limit, CORS allowlist, HSTS)', () => {
    const config = loadConfig({
      TESSERA_API_RATE_LIMIT_ENABLED: 'true',
      TESSERA_API_RATE_LIMIT: '30',
      TESSERA_API_RATE_LIMIT_WINDOW_MS: '1000',
      TESSERA_API_CORS_ALLOWED_ORIGINS: 'https://app.example.com, https://admin.example.com',
      TESSERA_API_HSTS: '1',
    });
    expect(config.api.rateLimit).toMatchObject({ enabled: true, limit: 30, windowMs: 1000 });
    expect(config.api.cors.allowedOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
    expect(config.api.security.hsts).toBe(true);
  });

  it('rejects an invalid api rate-limit number', () => {
    expect(() => loadConfig({ TESSERA_API_RATE_LIMIT: 'lots' })).toThrow(/invalid configuration/);
  });

  it('defaults memory retention to no rules (retention off, byte-stable)', () => {
    expect(loadConfig({}).memory.retention.rules).toEqual([]);
  });

  it('accepts memory retention rules (kind/scope + age/count thresholds) via overrides', () => {
    const config = loadConfig(
      {},
      {
        memory: {
          retention: {
            rules: [
              { kind: 'task', maxAgeDays: 7 },
              { scope: 'api', maxSupersededVersions: 2, maxSupersededAgeDays: 30 },
            ],
          },
        },
      },
    );
    expect(config.memory.retention.rules).toEqual([
      { kind: 'task', maxAgeDays: 7 },
      { scope: 'api', maxSupersededVersions: 2, maxSupersededAgeDays: 30 },
    ]);
  });

  it('rejects an unknown memory kind in a retention rule', () => {
    expect(() =>
      loadConfig({}, { memory: { retention: { rules: [{ kind: 'bogus' }] } } } as never),
    ).toThrow(/invalid configuration/);
  });
});
