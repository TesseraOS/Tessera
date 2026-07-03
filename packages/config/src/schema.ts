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
});

/** Caller-facing config input (pre-defaults). */
export type ConfigInput = z.input<typeof configSchema>;
/** Fully-resolved, validated config (post-defaults). */
export type TesseraConfig = z.output<typeof configSchema>;
