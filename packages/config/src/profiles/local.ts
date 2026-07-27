import { createSqliteSubscriptionStore, createSqliteUsageStore } from '@tessera/billing';
import { createKeywordRetriever, createTemporalRetriever } from '@tessera/retrieval';
import { createSqliteGraphStore } from '@tessera/knowledge-graph';
import { createSqliteMemoryStore } from '@tessera/memory';
import {
  createFilesystemBlobStore,
  createInProcessQueue,
  createSqliteStore,
  createSqliteVecStore,
} from '@tessera/storage';
import { createSqliteAuditLog } from '../audit/sqlite-audit-log.js';
import { createSqliteTokenStore } from '../auth/sqlite-token-store.js';
import { createSqliteProjectStore } from '../projects/sqlite-project-store.js';
import { createSqliteManifest } from '../sources/sqlite-manifest.js';
import { createSqliteSourceRegistry } from '../sources/sqlite-source-registry.js';
import type { Env } from '../load.js';
import type { Runtime } from '../runtime.js';
import type { TesseraConfig } from '../schema.js';
import { createSecretsProvider } from '../secrets/index.js';
import { assembleRuntime, type ProfileAdapters } from './assemble.js';
import { createEmbeddings } from './embeddings.js';

// Re-exported from its new home so existing importers are unaffected by the profile split.
export { SUPPORTED_SOURCE_KINDS } from './connectors.js';

export interface LocalRuntimeOptions {
  /** Environment used by the env secrets provider (default `process.env`). */
  readonly env?: Env;
}

/**
 * Wire the **Local** deployment profile (FR-50): SQLite (relational) + sqlite-vec (vector) +
 * filesystem (blob) + in-process queue + Transformers.js embeddings — **zero external services or
 * keys**. The embedding dimension is taken from the constructed provider so the vector store always
 * matches.
 *
 * This function now does exactly one thing: **construct this profile's adapters**. Composing them
 * into services is [`assembleRuntime`](./assemble.ts), shared with the self-hosted profile, so the
 * two profiles differ only in what they select (FR-53) — not in what they build out of it.
 */
export async function createLocalRuntime(
  config: TesseraConfig,
  options: LocalRuntimeOptions = {},
): Promise<Runtime> {
  const secrets = createSecretsProvider(config.secrets, options.env ?? process.env);

  const relational = createSqliteStore({ path: config.storage.sqlitePath });
  await relational.migrate();

  const embeddings = await createEmbeddings(config.embeddings);

  const adapters: ProfileAdapters = {
    relational,
    relationalName: 'sqlite',
    blob: createFilesystemBlobStore({ root: config.storage.blobRoot }),
    queue: createInProcessQueue(),
    vector: createSqliteVecStore({
      path: config.storage.vectorPath,
      dimension: embeddings.info.dimension,
    }),
    embeddings,
    graphStore: createSqliteGraphStore(relational.db),
    memoryStore: createSqliteMemoryStore(relational.db),
    keyword: createKeywordRetriever({ db: relational.db }),
    temporal: createTemporalRetriever({ db: relational.db }),
    manifest: createSqliteManifest(relational.db),
    registry: createSqliteSourceRegistry(relational.db),
    projectStore: createSqliteProjectStore(relational.db),
    // Usage + subscriptions are durable even here (F-057). Local is single-node, so an in-memory Map
    // would "work" — but a restart would then reset a tenant's month and lose its plan, and `profile:
    // local` + `billing.provider: dodo` is a legal config: a self-hoster on a paid plan.
    usageStore: createSqliteUsageStore(relational.db),
    subscriptionStore: createSqliteSubscriptionStore(relational.db),
    ...(config.auth.mode === 'token' ? { tokenStore: createSqliteTokenStore(relational.db) } : {}),
    ...(config.audit.enabled ? { auditLog: createSqliteAuditLog(relational.db) } : {}),
    // Every SQLite adapter shares the one handle `assembleRuntime` already closes; nothing else to do.
    close: () => Promise.resolve(),
  };

  return assembleRuntime(config, adapters, { secrets });
}
