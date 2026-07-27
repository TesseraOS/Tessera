import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteSubscriptionStore } from '@tessera/billing';
import { createPostgresStore, createSqliteStore } from '@tessera/storage';
import { loadConfig } from '../../src/load';
import { createRuntime } from '../../src/profiles/create-runtime';
import { createLocalRuntime } from '../../src/profiles/local';
import type { Runtime } from '../../src/runtime';

/**
 * **F-057 increment 4** — the composition root supplies a DURABLE usage store and subscription store
 * from both profiles, so neither survives only in one process's memory.
 *
 * The Local half runs in the default `test` gate; the self-hosted half is guarded by
 * `TESSERA_TEST_SELF_HOSTED=1` like its sibling suite, because it needs Postgres + MinIO + Redis.
 */

const selfHosted = process.env['TESSERA_TEST_SELF_HOSTED'] === '1';
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const REDIS_URL = process.env['TESSERA_REDIS_URL'] ?? 'redis://127.0.0.1:6379';
const S3_ENDPOINT = process.env['TESSERA_S3_ENDPOINT'] ?? 'http://127.0.0.1:9000';

describe('local profile — usage and subscriptions outlive the runtime', () => {
  let runtime: Runtime | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  /**
   * A FILE-backed SQLite database, deliberately — `:memory:` would vanish with the handle and the
   * second runtime would read an empty database no matter how the stores were wired, which would make
   * this test pass for the wrong reason.
   */
  async function boot(): Promise<Runtime> {
    dir ??= await mkdtemp(join(tmpdir(), 'tessera-usage-'));
    const config = loadConfig({
      TESSERA_SQLITE_PATH: join(dir, 'tessera.db'),
      TESSERA_VECTOR_PATH: ':memory:',
      TESSERA_BLOB_ROOT: join(dir, 'blobs'),
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '8',
    });
    return createLocalRuntime(config);
  }

  it('reads back usage recorded by a previous runtime over the same database', async () => {
    // Mutation check: putting an in-memory usage store back on the Local profile turns this red.
    const first = (runtime = await boot());
    await first.usage.record({
      tenantId: 'default',
      projectId: 'default',
      operation: 'compile',
      occurredAt: '2026-05-04T10:00:00.000Z',
      durationMs: 42,
      tokens: 1234,
    });
    await first.close();

    const second = (runtime = await boot());
    const summary = await second.usage.summarize({
      tenantId: 'default',
      from: '2026-05-01',
      until: '2026-05-31',
    });
    expect(summary).toEqual([
      expect.objectContaining({ operation: 'compile', count: 1, tokens: 1234 }),
    ]);
  });

  it('meters ingested documents when the worker writes them, not when a scan is requested', async () => {
    // ADR-0060 §5: `POST /v1/sources/:id/scan` returns 202 since F-081, so metering the REQUEST would
    // count intent. This asserts the subscriber counts real documents — and note the assertion is
    // "matches the number of documents the scan reported", not a hard-coded number, because that is
    // the property (one bucket increment per ingested document) rather than a fixture detail.
    //
    // Mutation check: removing the `document.ingested` subscriber from assembleRuntime turns this red.
    const rt = (runtime = await boot());
    const repo = await mkdtemp(join(tmpdir(), 'tessera-usage-repo-'));
    try {
      await mkdir(join(repo, 'src'), { recursive: true });
      await writeFile(join(repo, 'README.md'), '# Repo\n\nThe quernstone subsystem lives here.\n');
      await writeFile(join(repo, 'src', 'ledger.ts'), 'export const quernstone = 1;\n');

      const sources = rt.services.sources.forTenant('default');
      const source = await sources.register({ kind: 'filesystem', config: { root: repo } });
      const { summary } = await sources.scan(source.id);
      expect(summary.added).toBeGreaterThan(0);

      const today = new Date().toISOString().slice(0, 10);
      const ingested = await rt.usage.summarize({
        tenantId: 'default',
        from: today,
        until: today,
        operations: ['ingest'],
      });
      expect(ingested[0]?.count).toBe(summary.added);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('serves a paid plan the provider never saw, from the profile store — the F-030 seam, closed', async () => {
    // `createRuntimeBilling` used to build `createInMemorySubscriptionStore()` inline, so a
    // subscription lived inside one process and a restart downgraded every paying tenant to free.
    //
    // This asserts the wiring rather than the adapter (increment 3 covers the adapter): a `pro`
    // subscription is written straight into the database file BEFORE the runtime boots, and the Dodo
    // provider — which resolves `store.get(tenantId) ?? freeSubscription(...)` with no network call —
    // must find it. An in-memory store would return `free`.
    //
    // Mutation check: restoring `store: createInMemorySubscriptionStore()` in createRuntimeBilling
    // turns this red (planId 'free' instead of 'pro') and nothing else.
    dir ??= await mkdtemp(join(tmpdir(), 'tessera-usage-'));
    const dbPath = join(dir, 'tessera.db');
    const seed = createSqliteStore({ path: dbPath });
    try {
      await createSqliteSubscriptionStore(seed.db).upsert({
        tenantId: 'default',
        planId: 'pro',
        status: 'active',
        currentPeriodEnd: '2027-01-01T00:00:00.000Z',
        externalId: 'sub_seeded',
      });
    } finally {
      await seed.close();
    }

    const env = {
      TESSERA_SQLITE_PATH: dbPath,
      TESSERA_VECTOR_PATH: ':memory:',
      TESSERA_BLOB_ROOT: join(dir, 'blobs'),
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '8',
      TESSERA_BILLING_PROVIDER: 'dodo',
      TESSERA_SECRET_BILLING_DODO_API_KEY: 'test-key',
      TESSERA_SECRET_BILLING_DODO_WEBHOOK_SECRET: 'test-secret',
    };
    runtime = await createLocalRuntime(loadConfig(env), { env });

    expect(await runtime.services.billing.getSubscription('default')).toMatchObject({
      planId: 'pro',
      status: 'active',
      externalId: 'sub_seeded',
    });
  });
});

describe.skipIf(!selfHosted)(
  'self-hosted profile — usage and subscription tables exist and persist (TESSERA_TEST_SELF_HOSTED=1)',
  () => {
    let schemaCounter = 0;

    async function boot(
      overrides: Record<string, unknown> = {},
      extraEnv: Record<string, string> = {},
    ): Promise<{ runtime: Runtime; cleanup: () => Promise<void> }> {
      schemaCounter += 1;
      const schema = `usagesh_${Date.now().toString(36)}_${schemaCounter}`;
      const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
      await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
      await admin.close();

      const scopedUrl = `${CONNECTION_STRING}?options=-c%20search_path%3D${schema},public`;
      const env = {
        TESSERA_SECRET_DATABASE_URL: scopedUrl,
        TESSERA_SECRET_REDIS_URL: REDIS_URL,
        TESSERA_SECRET_S3_ACCESS_KEY_ID: 'tessera',
        TESSERA_SECRET_S3_SECRET_ACCESS_KEY: 'tessera-secret',
        ...extraEnv,
      };
      const config = loadConfig(env, {
        profile: 'self-hosted',
        embeddings: { provider: 'fake', dimension: 8 },
        storage: { s3: { bucket: 'tessera', endpoint: S3_ENDPOINT, forcePathStyle: true } },
        ...overrides,
      });
      const runtime = await createRuntime(config, { env });
      return {
        runtime,
        cleanup: async () => {
          await runtime.close();
          const cleaner = createPostgresStore({ connectionString: CONNECTION_STRING });
          await cleaner.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
          await cleaner.close();
        },
      };
    }

    it('applies the usage migration on boot and round-trips usage through the runtime', async () => {
      // This is what proves pgUsageMigrations was added to ALL_MIGRATIONS rather than just written:
      // the adapter never creates its own tables, so an unregistered migration set means the very
      // first record() fails with "relation does not exist".
      const booted = await boot();
      try {
        // Let the profile finish coming up before recording. The BullMQ worker's Redis connection is
        // still handshaking immediately after boot, and closing the runtime mid-handshake makes
        // ioredis reject with "Connection is closed" — an unhandled rejection that fails the RUN even
        // though every assertion passed. Readiness is the runtime's own answer to "am I up yet".
        expect(await booted.runtime.services.readiness?.()).toMatchObject({ ready: true });

        await booted.runtime.usage.record({
          tenantId: 'default',
          projectId: 'default',
          operation: 'search',
          occurredAt: '2026-05-04T10:00:00.000Z',
          durationMs: 7,
        });

        const summary = await booted.runtime.usage.summarize({
          tenantId: 'default',
          from: '2026-05-01',
          until: '2026-05-31',
        });
        expect(summary).toEqual([expect.objectContaining({ operation: 'search', count: 1 })]);
        expect(await booted.runtime.usage.earliestDay({ tenantId: 'default' })).toBe('2026-05-04');
      } finally {
        await booted.cleanup();
      }
    });

    it('applies the subscription migration on boot and queries it through the billing provider', async () => {
      // Its own case, because the usage case above does NOT cover it — measured, not assumed:
      // deleting `...pgSubscriptionMigrations` from ALL_MIGRATIONS left all 129 tests passing, since
      // nothing on the self-hosted path had ever touched the `subscriptions` table.
      //
      // The Dodo provider is what reaches it: `getSubscription` resolves
      // `store.get(tenantId) ?? freeSubscription(...)` with no network call, so a missing table is a
      // "relation does not exist" here and a free subscription otherwise.
      const booted = await boot(
        { billing: { provider: 'dodo' } },
        {
          TESSERA_SECRET_BILLING_DODO_API_KEY: 'test-key',
          TESSERA_SECRET_BILLING_DODO_WEBHOOK_SECRET: 'test-secret',
        },
      );
      try {
        expect(await booted.runtime.services.readiness?.()).toMatchObject({ ready: true });
        expect(await booted.runtime.services.billing.getSubscription('default')).toMatchObject({
          tenantId: 'default',
          planId: 'free',
        });
      } finally {
        await booted.cleanup();
      }
    });
  },
);
