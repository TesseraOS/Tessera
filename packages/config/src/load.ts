import { ValidationError } from '@tessera/core';
import { configSchema, type ConfigInput, type TesseraConfig } from './schema.js';

/** A read-only view of environment variables. */
export type Env = Record<string, string | undefined>;

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value === '' ? undefined : Number.NaN;
}

/** Parse a boolean env var: `1`/`true` → true, `0`/`false` → false, else undefined. */
function bool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return undefined;
}

/** Drop `undefined` values so a section only carries the keys actually provided. */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

function section<T extends Record<string, unknown>>(obj: T): Partial<T> | undefined {
  const cleaned = clean(obj);
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/**
 * Build a partial {@link ConfigInput} from `TESSERA_*` environment variables. Only present variables
 * are set, so schema defaults still apply. Values are validated by {@link loadConfig} (a bad number
 * becomes `NaN` so the schema rejects it rather than silently defaulting).
 */
export function configFromEnv(env: Env = process.env): ConfigInput {
  const input: Record<string, unknown> = clean({
    profile: env.TESSERA_PROFILE,
    env: env.TESSERA_ENV,
    logLevel: env.TESSERA_LOG_LEVEL,
  });

  const storage = section({
    sqlitePath: env.TESSERA_SQLITE_PATH,
    vectorPath: env.TESSERA_VECTOR_PATH,
    blobRoot: env.TESSERA_BLOB_ROOT,
  });
  const embeddings = section({
    provider: env.TESSERA_EMBEDDINGS_PROVIDER,
    model: env.TESSERA_EMBEDDINGS_MODEL,
    dimension: num(env.TESSERA_EMBEDDINGS_DIMENSION),
    ollamaUrl: env.TESSERA_OLLAMA_URL,
  });
  const budgets = section({
    defaultContextTokens: num(env.TESSERA_CONTEXT_BUDGET),
    retrievalLimit: num(env.TESSERA_RETRIEVAL_LIMIT),
  });
  const secrets = section({
    provider: env.TESSERA_SECRETS_PROVIDER,
    file: env.TESSERA_SECRETS_FILE,
    envPrefix: env.TESSERA_SECRET_PREFIX,
  });
  const authQuota = section({
    enabled: bool(env.TESSERA_AUTH_QUOTA_ENABLED),
    limit: num(env.TESSERA_AUTH_QUOTA_LIMIT),
    windowMs: num(env.TESSERA_AUTH_QUOTA_WINDOW_MS),
  });
  const authOidc = section({
    issuer: env.TESSERA_AUTH_OIDC_ISSUER,
    audience: env.TESSERA_AUTH_OIDC_AUDIENCE,
    jwksUri: env.TESSERA_AUTH_OIDC_JWKS_URI,
    rolesClaim: env.TESSERA_AUTH_OIDC_ROLES_CLAIM,
    tenantClaim: env.TESSERA_AUTH_OIDC_TENANT_CLAIM,
  });
  const auth = section({
    mode: env.TESSERA_AUTH_MODE,
    tenant: env.TESSERA_AUTH_TENANT,
    ...(authQuota !== undefined ? { quota: authQuota } : {}),
    ...(authOidc !== undefined ? { oidc: authOidc } : {}),
  });
  const billing = section({
    provider: env.TESSERA_BILLING_PROVIDER,
    dodoBaseUrl: env.TESSERA_BILLING_DODO_BASE_URL,
  });
  const auditRetention = section({
    maxAgeDays: num(env.TESSERA_AUDIT_RETENTION_MAX_AGE_DAYS),
    maxEntries: num(env.TESSERA_AUDIT_RETENTION_MAX_ENTRIES),
  });
  const audit = section({
    enabled: bool(env.TESSERA_AUDIT_ENABLED),
    ...(auditRetention !== undefined ? { retention: auditRetention } : {}),
  });
  const sources = section({
    autoScanOnRegister: bool(env.TESSERA_SOURCES_AUTOSCAN),
  });

  if (storage !== undefined) input.storage = storage;
  if (embeddings !== undefined) input.embeddings = embeddings;
  if (budgets !== undefined) input.budgets = budgets;
  if (secrets !== undefined) input.secrets = secrets;
  if (auth !== undefined) input.auth = auth;
  if (billing !== undefined) input.billing = billing;
  if (audit !== undefined) input.audit = audit;
  if (sources !== undefined) input.sources = sources;
  return input as ConfigInput;
}

/** Shallow-per-section merge; `over` wins over `base`. */
function mergeConfig(base: ConfigInput, over: ConfigInput): ConfigInput {
  return {
    ...base,
    ...over,
    ...((base.storage ?? over.storage) ? { storage: { ...base.storage, ...over.storage } } : {}),
    ...((base.embeddings ?? over.embeddings)
      ? { embeddings: { ...base.embeddings, ...over.embeddings } }
      : {}),
    ...((base.budgets ?? over.budgets) ? { budgets: { ...base.budgets, ...over.budgets } } : {}),
    ...((base.secrets ?? over.secrets) ? { secrets: { ...base.secrets, ...over.secrets } } : {}),
    ...((base.auth ?? over.auth) ? { auth: { ...base.auth, ...over.auth } } : {}),
    ...((base.billing ?? over.billing) ? { billing: { ...base.billing, ...over.billing } } : {}),
    ...((base.audit ?? over.audit) ? { audit: { ...base.audit, ...over.audit } } : {}),
    ...((base.sources ?? over.sources) ? { sources: { ...base.sources, ...over.sources } } : {}),
  };
}

/** Identity helper for authoring typed config inline. */
export function defineConfig(config: ConfigInput): ConfigInput {
  return config;
}

/**
 * Load and validate configuration: `TESSERA_*` env overrides merged with explicit `overrides`
 * (which win), validated against {@link configSchema}. Throws a typed {@link ValidationError} on
 * invalid input — fail fast at startup rather than mis-wire adapters.
 */
export function loadConfig(env: Env = process.env, overrides: ConfigInput = {}): TesseraConfig {
  const merged = mergeConfig(configFromEnv(env), overrides);
  const result = configSchema.safeParse(merged);
  if (!result.success) {
    throw new ValidationError('invalid configuration', {
      details: { issues: result.error.issues },
    });
  }
  return result.data;
}
