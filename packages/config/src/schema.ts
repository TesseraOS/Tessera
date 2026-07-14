import { DEPLOYMENT_PROFILES } from '@tessera/core';
import { z } from 'zod';

/** Embedding providers selectable by config. `transformers` is the local default (zero keys). */
export const EMBEDDING_PROVIDERS = ['transformers', 'ollama', 'fake'] as const;
export type EmbeddingProvider = (typeof EMBEDDING_PROVIDERS)[number];

/** Secrets backends available locally (KMS/vault arrive for cloud — ARCHITECTURE §132). */
export const SECRETS_PROVIDERS = ['env', 'file'] as const;
export type SecretsProviderKind = (typeof SECRETS_PROVIDERS)[number];

/** Root directory for the local stack's data (sqlite dbs + blobs) when paths are not overridden. */
export const DEFAULT_DATA_DIR = '.tessera';

/**
 * Authentication modes: `none` = zero-auth local (full access); `token` = Bearer API token (F-025);
 * `oidc` = verify JWTs from an external OIDC IdP (F-036).
 */
export const AUTH_MODES = ['none', 'token', 'oidc'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** Billing providers: `none` = local/free (OSS default); `dodo` = Dodo Payments (cloud, F-030). */
export const BILLING_PROVIDERS = ['none', 'dodo'] as const;
export type BillingProviderKind = (typeof BILLING_PROVIDERS)[number];

const storageSchema = z
  .object({
    /** RelationalStore path (`:memory:` for ephemeral). */
    sqlitePath: z.string().min(1).default(`${DEFAULT_DATA_DIR}/tessera.db`),
    /** VectorStore (sqlite-vec) path. */
    vectorPath: z.string().min(1).default(`${DEFAULT_DATA_DIR}/vectors.db`),
    /** Filesystem BlobStore root (also backs the compiler's fragment corpus). */
    blobRoot: z.string().min(1).default(`${DEFAULT_DATA_DIR}/blobs`),
  })
  .default({});

const embeddingsSchema = z
  .object({
    provider: z.enum(EMBEDDING_PROVIDERS).default('transformers'),
    /** Model id (transformers/ollama). */
    model: z.string().min(1).optional(),
    /** Fixed dimension for the `fake` provider (ignored otherwise). */
    dimension: z.number().int().positive().optional(),
    /** Ollama base URL (provider `ollama`). */
    ollamaUrl: z.string().url().optional(),
  })
  .default({});

const budgetsSchema = z
  .object({
    /** Default token budget for context compilation. */
    defaultContextTokens: z.number().int().positive().default(8000),
    /** Default per-need retrieval limit. */
    retrievalLimit: z.number().int().positive().default(20),
  })
  .default({});

const secretsSchema = z
  .object({
    provider: z.enum(SECRETS_PROVIDERS).default('env'),
    /** Path to a JSON secrets file (provider `file`). */
    file: z.string().min(1).optional(),
    /** Env-var prefix for the `env` provider (e.g. `TESSERA_SECRET_`). */
    envPrefix: z.string().default('TESSERA_SECRET_'),
  })
  .default({});

/** Per-principal MCP quota (F-026). Off by default; a distributed store is a deployment seam. */
const authQuotaSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Max calls per principal per window. */
    limit: z.number().int().positive().default(120),
    /** Window length in ms. */
    windowMs: z.number().int().positive().default(60_000),
  })
  .default({});

/** OIDC settings (F-036); `issuer` + `audience` are required when `auth.mode = oidc`. */
const authOidcSchema = z
  .object({
    issuer: z.string().url().optional(),
    audience: z.string().min(1).optional(),
    /** JWKS URL; defaults to `${issuer}/.well-known/jwks.json`. */
    jwksUri: z.string().url().optional(),
    /** Claim carrying roles (default `roles`). */
    rolesClaim: z.string().min(1).optional(),
    /** Claim carrying the tenant/org id (default `tenant_id`). */
    tenantClaim: z.string().min(1).optional(),
  })
  .default({});

/**
 * Auth wiring (F-025/F-026/F-034/F-036). `mode: none` keeps the zero-auth Local behavior (full access in
 * the `tenant`); `mode: token` requires a Bearer token from the persistent token store; `mode: oidc`
 * verifies JWTs from an external OIDC IdP (see `oidc`).
 */
const authSchema = z
  .object({
    mode: z.enum(AUTH_MODES).default('none'),
    /** Tenant assigned to the local principal in `none` mode. */
    tenant: z.string().min(1).default('default'),
    quota: authQuotaSchema,
    oidc: authOidcSchema,
  })
  .default({})
  .superRefine((value, ctx) => {
    if (
      value.mode === 'oidc' &&
      (value.oidc.issuer === undefined || value.oidc.audience === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth.oidc.issuer and auth.oidc.audience are required when auth.mode is "oidc"',
        path: ['oidc'],
      });
    }
  });

/** Audit-trail retention (NFR-13): prune events older than `maxAgeDays` and/or beyond `maxEntries` per tenant. */
const auditRetentionSchema = z
  .object({
    maxAgeDays: z.number().int().positive().optional(),
    maxEntries: z.number().int().positive().optional(),
  })
  .default({});

/**
 * Audit-trail wiring (F-027; FR-55/NFR-13). `enabled` (default true) records sensitive actions into a
 * persistent, tenant-scoped SQLite trail queryable at `GET /v1/audit`; `retention` prunes it. Disabling
 * falls back to the non-durable in-memory sink in `@tessera/api`.
 */
const auditSchema = z
  .object({
    enabled: z.boolean().default(true),
    retention: auditRetentionSchema,
  })
  .default({});

/**
 * Runtime source-management wiring (F-038; FR-62). Sources are registered at runtime via the API/MCP
 * surface, not statically in config; this section holds ingestion behavior. `autoScanOnRegister`
 * triggers a scan immediately when a source is registered (off by default — an agent decides when).
 */
const sourcesSchema = z
  .object({
    autoScanOnRegister: z.boolean().default(false),
  })
  .default({});

/**
 * Billing wiring (F-030). `provider: none` = the local/free adapter (OSS default, no external service);
 * `provider: dodo` = Dodo Payments (secrets — apiKey/webhookSecret — come via the SecretsProvider).
 */
const billingSchema = z
  .object({
    provider: z.enum(BILLING_PROVIDERS).default('none'),
    /** Dodo API base URL override (sandbox); non-secret. */
    dodoBaseUrl: z.string().url().optional(),
  })
  .default({});

/** Per-`/v1` request rate limiting (F-044; NFR-1). Off by default; a distributed store is a seam. */
const apiRateLimitSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Max requests per key (principal, fallback IP) per window. */
    limit: z.number().int().positive().default(120),
    /** Window length in ms. */
    windowMs: z.number().int().positive().default(60_000),
  })
  .default({});

/** Per-profile CORS allowlist (F-044; ADR-0035). Empty ⇒ loopback-permissive local default. */
const apiCorsSchema = z
  .object({
    /** Exact allowed browser origins (e.g. `https://app.example.com`). */
    allowedOrigins: z.array(z.string().min(1)).default([]),
  })
  .default({});

/**
 * HTTP hardening for the `/v1` surface (F-044; NFR-2). Security headers are always applied; `hsts`
 * adds `Strict-Transport-Security` and must only be enabled when the API is served over TLS
 * (directly or behind a TLS-terminating proxy).
 */
const apiSecuritySchema = z
  .object({
    hsts: z.boolean().default(false),
  })
  .default({});

/** API-surface hardening config (F-044): rate limiting, CORS allowlist, security headers. */
const apiSchema = z
  .object({
    rateLimit: apiRateLimitSchema,
    cors: apiCorsSchema,
    security: apiSecuritySchema,
  })
  .default({});

/** The validated Tessera configuration (FR-50). Deployment is configuration — one surface. */
export const configSchema = z.object({
  profile: z.enum(DEPLOYMENT_PROFILES as unknown as [string, ...string[]]).default('local'),
  env: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  storage: storageSchema,
  embeddings: embeddingsSchema,
  budgets: budgetsSchema,
  secrets: secretsSchema,
  auth: authSchema,
  billing: billingSchema,
  audit: auditSchema,
  sources: sourcesSchema,
  api: apiSchema,
});

/** Caller-facing config input (pre-defaults). */
export type ConfigInput = z.input<typeof configSchema>;
/** Fully-resolved, validated config (post-defaults). */
export type TesseraConfig = z.output<typeof configSchema>;
