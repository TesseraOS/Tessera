import { ValidationError } from '@tessera/core';
import {
  createPostgresSubscriptionStore,
  createPostgresUsageStore,
  pgSubscriptionMigrations,
  pgUsageMigrations,
} from '@tessera/billing';
import { createPostgresGraphStore, pgGraphMigrations } from '@tessera/knowledge-graph';
import { createPostgresMemoryStore, pgMemoryMigrations } from '@tessera/memory';
import {
  createPostgresKeywordRetriever,
  createPostgresTemporalRetriever,
  pgKeywordMigrations,
  pgTemporalMigrations,
} from '@tessera/retrieval';
import {
  createBullMqQueue,
  createPgVectorStore,
  createPostgresStore,
  createS3BlobStore,
  pgClientMigrationDb,
  runMigrations,
  withPgAdvisoryLock,
} from '@tessera/storage';
import { createPostgresAuditLog, pgAuditLogMigrations } from '../audit/postgres-audit-log.js';
import { createPostgresTokenStore, pgTokenStoreMigrations } from '../auth/postgres-token-store.js';
import {
  createPostgresProjectStore,
  pgProjectStoreMigrations,
} from '../projects/postgres-project-store.js';
import { createPostgresManifest, pgManifestMigrations } from '../sources/postgres-manifest.js';
import {
  createPostgresSourceRegistry,
  pgSourceRegistryMigrations,
} from '../sources/postgres-source-registry.js';
import type { Env } from '../load.js';
import type { Runtime } from '../runtime.js';
import type { TesseraConfig } from '../schema.js';
import { createSecretsProvider, type SecretsProvider } from '../secrets/index.js';
import { assembleRuntime, type ProfileAdapters } from './assemble.js';
import { createEmbeddings } from './embeddings.js';

export interface SelfHostedRuntimeOptions {
  /** Environment used by the env secrets provider (default `process.env`). */
  readonly env?: Env;
}

/**
 * A **session-scoped advisory lock id** for the boot migration. Any constant works as long as every
 * replica uses the same one; this is `tessera` + a purpose tag.
 */
const MIGRATION_LOCK_ID = 0x7e55e7a_0000_0001n;

/**
 * Every package's migrations, applied together at boot.
 *
 * Order matters only in that it is stable: the runner records applied ids, so a replica that starts
 * later applies exactly the ones it is missing. Collected here rather than inside each adapter
 * because a table must exist before *any* replica queries it, and eleven adapters each racing their
 * own `CREATE TABLE` on startup is the failure this centralization prevents.
 */
const ALL_MIGRATIONS = [
  ...pgMemoryMigrations,
  ...pgGraphMigrations,
  ...pgKeywordMigrations,
  ...pgTemporalMigrations,
  ...pgManifestMigrations,
  ...pgSourceRegistryMigrations,
  ...pgProjectStoreMigrations,
  ...pgTokenStoreMigrations,
  ...pgAuditLogMigrations,
  ...pgUsageMigrations,
  ...pgSubscriptionMigrations,
];

/** Read a required secret, with an error naming the setting rather than the internal key. */
async function requireSecret(secrets: SecretsProvider, key: string, what: string): Promise<string> {
  try {
    return await secrets.require(key);
  } catch {
    throw new ValidationError(
      `the self-hosted profile requires ${what} (secret "${key}", e.g. TESSERA_SECRET_${key})`,
    );
  }
}

/**
 * Wire the **self-hosted** deployment profile (FR-51/FR-53, F-056, ADR-0059): Postgres (relational,
 * vector via pgvector, memory, graph, keyword full-text, temporal, and the whole control plane),
 * S3-compatible object storage, and a BullMQ/Redis queue.
 *
 * **No SQLite anywhere in the data path** — that is the point. A profile that kept a single-writer
 * file for tokens or the audit trail would forfeit exactly the horizontal scale self-hosted exists
 * for, while looking like it had it.
 *
 * Like [`createLocalRuntime`](./local.ts), this function only **constructs adapters**; composing them
 * is the shared [`assembleRuntime`](./assemble.ts). The two profiles differ in what they select, not
 * in what they build out of it (FR-53).
 *
 * Schema is applied once at boot under a Postgres **advisory lock**, because the migration runner
 * reads-then-applies and several replicas booting together would otherwise race.
 */
export async function createSelfHostedRuntime(
  config: TesseraConfig,
  options: SelfHostedRuntimeOptions = {},
): Promise<Runtime> {
  const secrets = createSecretsProvider(config.secrets, options.env ?? process.env);

  const connectionString = await requireSecret(secrets, 'DATABASE_URL', 'a Postgres connection');
  const redisUrl = await requireSecret(
    secrets,
    'REDIS_URL',
    'a Redis connection for the job queue',
  );

  const { bucket, endpoint, region, forcePathStyle } = config.storage.s3;
  if (bucket === undefined) {
    throw new ValidationError('storage.s3.bucket is required for the self-hosted profile');
  }
  const [accessKeyId, secretAccessKey] = await Promise.all([
    requireSecret(secrets, 'S3_ACCESS_KEY_ID', 'S3 credentials'),
    requireSecret(secrets, 'S3_SECRET_ACCESS_KEY', 'S3 credentials'),
  ]);

  const relational = createPostgresStore({ connectionString });

  // One migration pass for every package, serialized across replicas.
  await withPgAdvisoryLock(relational.pool, MIGRATION_LOCK_ID, async (client) => {
    await runMigrations(pgClientMigrationDb(client), ALL_MIGRATIONS);
  });

  const embeddings = await createEmbeddings(config.embeddings);

  const queue = createBullMqQueue({ connection: redisUrl });

  const adapters: ProfileAdapters = {
    relational,
    relationalName: 'postgres',
    blob: createS3BlobStore({
      bucket,
      region,
      forcePathStyle,
      ...(endpoint !== undefined ? { endpoint } : {}),
      credentials: { accessKeyId, secretAccessKey },
    }),
    queue,
    // Its own pool, not `relational.pool`: the F-023 adapter owns its connection lifecycle, and
    // `assembleRuntime` closes it. Two pools to one database is the cost; sharing one would mean the
    // vector store's `close()` tearing down the relational store's connections underneath it.
    vector: createPgVectorStore({
      connectionString,
      dimension: embeddings.info.dimension,
    }),
    embeddings,
    graphStore: createPostgresGraphStore(relational.db),
    memoryStore: createPostgresMemoryStore(relational.db),
    keyword: createPostgresKeywordRetriever({ db: relational.db }),
    temporal: createPostgresTemporalRetriever({ db: relational.db }),
    manifest: createPostgresManifest(relational.db),
    registry: createPostgresSourceRegistry(relational.db),
    projectStore: createPostgresProjectStore(relational.db),
    usageStore: createPostgresUsageStore(relational.db),
    subscriptionStore: createPostgresSubscriptionStore(relational.db),
    ...(config.auth.mode === 'token'
      ? { tokenStore: createPostgresTokenStore(relational.db) }
      : {}),
    ...(config.audit.enabled ? { auditLog: createPostgresAuditLog(relational.db) } : {}),
    // `assembleRuntime` already shuts the queue down and closes the relational store; BullMQ's own
    // Redis connections are released by that shutdown, so there is nothing left for the profile.
    close: () => Promise.resolve(),
  };

  return assembleRuntime(config, adapters, { secrets });
}
