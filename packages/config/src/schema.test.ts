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

  it('maps TESSERA_S3_* addressing, keeping credentials out of config (F-056)', () => {
    const config = loadConfig({
      TESSERA_S3_BUCKET: 'tessera',
      TESSERA_S3_ENDPOINT: 'http://127.0.0.1:9000',
      TESSERA_S3_REGION: 'eu-west-1',
      TESSERA_S3_FORCE_PATH_STYLE: '1',
    });
    expect(config.storage.s3).toEqual({
      bucket: 'tessera',
      endpoint: 'http://127.0.0.1:9000',
      region: 'eu-west-1',
      forcePathStyle: true,
    });
    // Credentials are a SecretsProvider concern; config is a file people commit and paste into
    // issues, so there must be nowhere here to put a secret by accident.
    expect(JSON.stringify(config.storage.s3)).not.toMatch(/secret|accessKey/i);
  });

  it('defaults s3 addressing without requiring any of it for the local profile', () => {
    expect(loadConfig({}).storage.s3).toEqual({ region: 'us-east-1', forcePathStyle: false });
  });

  it('rejects an invalid api rate-limit number', () => {
    expect(() => loadConfig({ TESSERA_API_RATE_LIMIT: 'lots' })).toThrow(/invalid configuration/);
  });

  describe('remote MCP over HTTP (F-055; ADR-0058)', () => {
    it('is off by default — stdio stays the local default', () => {
      expect(loadConfig({}).mcp.http).toMatchObject({
        enabled: false,
        path: '/mcp',
        sessionTtlMs: 300_000,
        maxSessions: 100,
      });
    });

    it('REFUSES to enable remote MCP while auth.mode is none (NFR-2)', () => {
      // The whole point: a network-reachable agent surface with a provider that authenticates
      // anything. This must die at config load, not at the first unauthenticated tool call.
      expect(() => loadConfig({}, { mcp: { http: { enabled: true } } })).toThrow(
        /invalid configuration/,
      );
      expect(() =>
        loadConfig({}, { auth: { mode: 'none' }, mcp: { http: { enabled: true } } }),
      ).toThrow(/invalid configuration/);
    });

    it('names both keys in the failure so the operator knows what to change', () => {
      try {
        loadConfig({}, { mcp: { http: { enabled: true } } });
        expect.unreachable('expected the cross-section refinement to reject this config');
      } catch (error) {
        const message = JSON.stringify((error as { details?: unknown }).details);
        expect(message).toContain('mcp.http.enabled');
        expect(message).toContain('auth.mode');
      }
    });

    it('accepts remote MCP under token and oidc auth', () => {
      const token = loadConfig({}, { auth: { mode: 'token' }, mcp: { http: { enabled: true } } });
      expect(token.mcp.http.enabled).toBe(true);

      const oidc = loadConfig(
        {},
        {
          auth: {
            mode: 'oidc',
            oidc: { issuer: 'https://idp.example.com', audience: 'tessera-api' },
          },
          mcp: { http: { enabled: true } },
        },
      );
      expect(oidc.mcp.http.enabled).toBe(true);
    });

    it('maps TESSERA_MCP_HTTP_* overrides', () => {
      const config = loadConfig({
        TESSERA_AUTH_MODE: 'token',
        TESSERA_MCP_HTTP_ENABLED: '1',
        TESSERA_MCP_HTTP_PATH: '/agent/mcp',
        TESSERA_MCP_HTTP_SESSION_TTL_MS: '60000',
        TESSERA_MCP_HTTP_MAX_SESSIONS: '5',
      });
      expect(config.mcp.http).toMatchObject({
        enabled: true,
        path: '/agent/mcp',
        sessionTtlMs: 60_000,
        maxSessions: 5,
      });
    });

    it('rejects a path that is not rooted, and non-positive limits', () => {
      expect(() => loadConfig({ TESSERA_MCP_HTTP_PATH: 'mcp' })).toThrow(/invalid configuration/);
      expect(() => loadConfig({ TESSERA_MCP_HTTP_MAX_SESSIONS: '0' })).toThrow(
        /invalid configuration/,
      );
      expect(() => loadConfig({ TESSERA_MCP_HTTP_SESSION_TTL_MS: '-1' })).toThrow(
        /invalid configuration/,
      );
    });
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
