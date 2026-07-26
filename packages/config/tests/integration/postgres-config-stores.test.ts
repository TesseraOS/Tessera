import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import {
  createPostgresStore,
  pgClientMigrationDb,
  runMigrations,
  withPgAdvisoryLock,
} from '@tessera/storage';
// Dedicated subpaths, not the package roots: these conformance modules import vitest, and the root
// entries are loaded by the shipped runtime.
import { runSourceRegistryConformance } from '@tessera/ingestion/conformance';
import { runAuditLogConformance, runProjectStoreConformance } from '@tessera/api/conformance';
import { createPostgresManifest, pgManifestMigrations } from '../../src/sources/postgres-manifest';
import {
  createPostgresSourceRegistry,
  pgSourceRegistryMigrations,
} from '../../src/sources/postgres-source-registry';
import {
  createPostgresProjectStore,
  pgProjectStoreMigrations,
} from '../../src/projects/postgres-project-store';
import {
  createPostgresTokenStore,
  pgTokenStoreMigrations,
} from '../../src/auth/postgres-token-store';
import { createPostgresAuditLog, pgAuditLogMigrations } from '../../src/audit/postgres-audit-log';

/**
 * The five Postgres control-plane stores from F-056 increment 7 — manifest, source registry, project
 * store, token store, and audit log — against a real Postgres. Guarded like every other F-023/F-056
 * Postgres suite:
 *
 *   docker compose up -d postgres
 *   TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/config test
 */
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

const ALL_MIGRATIONS = [
  ...pgManifestMigrations,
  ...pgSourceRegistryMigrations,
  ...pgProjectStoreMigrations,
  ...pgTokenStoreMigrations,
  ...pgAuditLogMigrations,
];

let schemaCounter = 0;

interface Harness {
  readonly db: NodePgDatabase;
  readonly cleanup: () => Promise<void>;
}

/**
 * A fresh Postgres schema per harness (ADR-0059 §3): isolation via `search_path`, not a `tableName`
 * option on the adapter — a test concern does not belong in a production constructor.
 */
async function freshSchema(prefix: string): Promise<Harness> {
  schemaCounter += 1;
  const schema = `${prefix}_${Date.now().toString(36)}_${schemaCounter}`;
  const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
  await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
  await admin.close();

  // Every pooled connection sets search_path on connect, so a query cannot land on a client still
  // pointed at `public`.
  const scoped = createPostgresStore({
    connectionString: `${CONNECTION_STRING}?options=-c%20search_path%3D${schema}`,
  });
  await withPgAdvisoryLock(scoped.pool, 0x7e55e7a_0000_0007n, async (client) => {
    await client.query(`SET search_path TO ${schema}`);
    await runMigrations(pgClientMigrationDb(client), ALL_MIGRATIONS);
  });

  return {
    db: scoped.db,
    cleanup: async () => {
      await scoped.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await scoped.close();
    },
  };
}

describe.skipIf(!enabled)('postgres config stores (TESSERA_TEST_POSTGRES=1)', () => {
  // The Postgres registry must satisfy the SAME shared contract the SQLite one does, including the
  // tenant/project isolation cases.
  runSourceRegistryConformance('postgres', async () => {
    const { db, cleanup } = await freshSchema('reg');
    return { registry: createPostgresSourceRegistry(db), cleanup };
  });

  describe('ingestion manifest', () => {
    it('records, reads, snapshots, and deletes content hashes per (source, path)', async () => {
      const { db, cleanup } = await freshSchema('man');
      try {
        const manifest = createPostgresManifest(db);
        await manifest.set('src-1', 'a.ts', 'hash-a');
        await manifest.set('src-1', 'b.ts', 'hash-b');
        await manifest.set('src-2', 'a.ts', 'other');

        expect(await manifest.get('src-1', 'a.ts')).toBe('hash-a');
        expect(await manifest.get('src-1', 'missing.ts')).toBeUndefined();

        // A snapshot is scoped to its source — src-2's identically-named path must not leak in.
        expect(await manifest.snapshot('src-1')).toEqual(
          new Map([
            ['a.ts', 'hash-a'],
            ['b.ts', 'hash-b'],
          ]),
        );

        await manifest.delete('src-1', 'a.ts');
        expect(await manifest.get('src-1', 'a.ts')).toBeUndefined();
        expect(await manifest.get('src-2', 'a.ts')).toBe('other'); // untouched
      } finally {
        await cleanup();
      }
    });

    it('re-sets an existing (source, path) rather than duplicating it', async () => {
      // This is what makes scans idempotent (FR-8): the composite PK plus onConflictDoUpdate. Without
      // the upsert the second set would raise a duplicate-key error, not silently double the row.
      const { db, cleanup } = await freshSchema('man');
      try {
        const manifest = createPostgresManifest(db);
        await manifest.set('src-1', 'a.ts', 'first');
        await manifest.set('src-1', 'a.ts', 'second');

        expect(await manifest.get('src-1', 'a.ts')).toBe('second');
        expect(await manifest.snapshot('src-1')).toEqual(new Map([['a.ts', 'second']]));
      } finally {
        await cleanup();
      }
    });
  });

  // The real shared suites the in-memory reference adapters run — reachable cross-package for the
  // first time via `@tessera/api/conformance` (added by this increment).
  runProjectStoreConformance('postgres', async () => {
    const { db, cleanup } = await freshSchema('proj');
    return { store: createPostgresProjectStore(db), cleanup };
  });

  runAuditLogConformance('postgres', async () => {
    const { db, cleanup } = await freshSchema('audit');
    return { log: createPostgresAuditLog(db), cleanup };
  });

  describe('token store', () => {
    it('issues a token whose secret verifies once, then stops after revoke', async () => {
      const { db, cleanup } = await freshSchema('tok');
      try {
        const store = createPostgresTokenStore(db);
        const { token, record } = await store.issue({
          tenantId: 'acme',
          principalId: 'ci-bot',
          roles: ['member'],
        });

        expect(token).toMatch(/^tsk_/);
        expect(await store.verify(token)).toMatchObject({ id: record.id, tenantId: 'acme' });

        await store.revoke(record.id);
        expect(await store.verify(token)).toBeNull();
      } finally {
        await cleanup();
      }
    });

    it('never stores the plaintext secret', async () => {
      // The security property worth asserting directly rather than trusting: the column holds a
      // hash, so a database dump does not hand over working credentials.
      const { db, cleanup } = await freshSchema('tok');
      try {
        const store = createPostgresTokenStore(db);
        const { token } = await store.issue({
          tenantId: 'acme',
          principalId: 'ci-bot',
          roles: ['member'],
        });

        const rows = await db.execute(sql`SELECT secret_hash FROM api_tokens`);
        const stored = (rows.rows[0] as { secret_hash: string }).secret_hash;
        expect(stored).not.toBe(token);
        expect(stored).not.toContain(token);
      } finally {
        await cleanup();
      }
    });

    it('rejects an expired token and lists per tenant', async () => {
      const { db, cleanup } = await freshSchema('tok');
      try {
        const store = createPostgresTokenStore(db);
        const past = new Date(Date.now() - 60_000).toISOString();
        const { token } = await store.issue({
          tenantId: 'acme',
          principalId: 'ci-bot',
          roles: ['member'],
          expiresAt: past,
        });
        expect(await store.verify(token)).toBeNull();

        await store.issue({ tenantId: 'globex', principalId: 'other', roles: ['viewer'] });
        expect((await store.list('acme')).map((r) => r.principalId)).toEqual(['ci-bot']);
        expect((await store.list('globex')).map((r) => r.principalId)).toEqual(['other']);
      } finally {
        await cleanup();
      }
    });
  });

  describe('audit log — the two places a dialect can silently disagree', () => {
    it('paginates across a cursor boundary with no overlap and no gap', async () => {
      // Deliberately >9 rows, so a lexicographic comparison ('9' < '10' is false) would show up.
      // NOTE: mutation-checked — switching the column to bigint mode does NOT fail this, because
      // Drizzle maps the column either way; the earlier claim that this test pins `mode: 'number'`
      // was wrong. What it does catch is a cursor off-by-one: flipping `lt` to `lte` turns it red.
      // The `number` mode is still correct (a raw string seq would compare lexicographically), it is
      // simply not what this test proves.
      const { db, cleanup } = await freshSchema('audit');
      try {
        const log = createPostgresAuditLog(db).forTenant('acme');
        for (let i = 0; i < 12; i += 1) {
          await log.record({
            tenantId: 'acme',
            actor: { principalId: 'user-1', kind: 'user' },
            action: 'search',
            outcome: 'success',
          });
        }

        const first = await log.query({ limit: 5 });
        expect(first.events).toHaveLength(5);
        expect(first.nextCursor).toBeDefined();

        const second = await log.query({ limit: 5, cursor: first.nextCursor });
        expect(second.events).toHaveLength(5);

        // No overlap and no gap: 10 distinct events across the two pages.
        const ids = new Set([...first.events, ...second.events].map((e) => e.id));
        expect(ids.size).toBe(10);
      } finally {
        await cleanup();
      }
    });

    it('buckets activity by the offset-shifted calendar day, matching SQLite at offset 0', async () => {
      // SQLite spells this `date(at, '<n> minutes')`; Postgres has no such function. The equivalent
      // must produce the same YYYY-MM-DD, or the dashboard's chart differs by deployment profile.
      const { db, cleanup } = await freshSchema('audit');
      try {
        const log = createPostgresAuditLog(db).forTenant('acme');
        // 23:30 UTC — the same instant is the 2nd in UTC and the 3rd at +60 minutes.
        await log.record({
          tenantId: 'acme',
          actor: { principalId: 'user-1', kind: 'user' },
          action: 'search',
          outcome: 'success',
          at: '2026-07-02T23:30:00.000Z',
        });

        const utc = await log.activity({
          since: '2026-07-01T00:00:00.000Z',
          until: '2026-07-05T00:00:00.000Z',
        });
        expect(utc.buckets).toEqual([{ date: '2026-07-02', count: 1 }]);

        const shifted = await log.activity({
          since: '2026-07-01T00:00:00.000Z',
          until: '2026-07-05T00:00:00.000Z',
          tzOffsetMinutes: 60,
        });
        expect(shifted.buckets).toEqual([{ date: '2026-07-03', count: 1 }]);

        // The retention floor is over the whole tenant trail, so a pruned day never reads as silence.
        expect(utc.earliest).toBe('2026-07-02T23:30:00.000Z');
      } finally {
        await cleanup();
      }
    });
  });
});
