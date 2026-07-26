import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import {
  createPostgresStore,
  pgClientMigrationDb,
  runMigrations,
  withPgAdvisoryLock,
} from '@tessera/storage';
import {
  createPostgresKeywordRetriever,
  pgKeywordMigrations,
} from '../../src/adapters/postgres-keyword-retriever';
import {
  createPostgresTemporalRetriever,
  pgTemporalMigrations,
} from '../../src/adapters/postgres-temporal-retriever';
import { runRetrieverConformance } from '../conformance/retriever.conformance';

/**
 * The Postgres keyword (full-text) and temporal retrievers against a real Postgres, running the SAME
 * conformance suite their SQLite twins run.
 *
 *   docker compose up -d postgres
 *   TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/retrieval test
 */
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

const NOW = Date.parse('2026-07-02T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ALL_MIGRATIONS = [...pgKeywordMigrations, ...pgTemporalMigrations];

let schemaCounter = 0;

/** A fresh Postgres schema per harness (ADR-0059 §3) — isolation via `search_path`. */
async function freshSchema(): Promise<{ db: NodePgDatabase; cleanup: () => Promise<void> }> {
  schemaCounter += 1;
  const schema = `ret_${Date.now().toString(36)}_${schemaCounter}`;
  const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
  await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
  await admin.close();

  const scoped = createPostgresStore({
    connectionString: `${CONNECTION_STRING}?options=-c%20search_path%3D${schema}`,
  });
  await withPgAdvisoryLock(scoped.pool, 0x7e55e7a_0000_0008n, async (client) => {
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

describe.skipIf(!enabled)('postgres retrievers (TESSERA_TEST_POSTGRES=1)', () => {
  runRetrieverConformance('postgres-keyword', 'keyword', async () => {
    const { db, cleanup } = await freshSchema();
    const retriever = createPostgresKeywordRetriever({ db });
    await retriever.index('doc:auth', 'authentication and login with OAuth tokens');
    await retriever.index('doc:db', 'database migrations with drizzle and postgres');
    return { retriever, query: 'oauth tokens', cleanup };
  });

  runRetrieverConformance('postgres-temporal', 'temporal', async () => {
    const { db, cleanup } = await freshSchema();
    const retriever = createPostgresTemporalRetriever({ db, now: () => NOW });
    await retriever.index('doc:old', NOW - 60 * DAY_MS);
    await retriever.index('doc:new', NOW - 1 * DAY_MS);
    return { retriever, query: 'anything', cleanup };
  });

  describe('keyword (full-text)', () => {
    it('matches by term, re-indexes idempotently, and removes', async () => {
      const { db, cleanup } = await freshSchema();
      try {
        const retriever = createPostgresKeywordRetriever({ db });
        await retriever.index('doc:auth', 'authentication and login with OAuth tokens');
        await retriever.index('doc:db', 'database migrations with drizzle and postgres');

        expect((await retriever.retrieve({ text: 'drizzle migrations' }))[0]?.ref).toBe('doc:db');
        expect((await retriever.retrieve({ text: 'oauth' }))[0]?.ref).toBe('doc:auth');

        // Re-indexing the same ref must update, not duplicate — that is what makes a rescan safe.
        await retriever.index('doc:auth', 'authentication and login with OAuth tokens');
        expect(await retriever.retrieve({ text: 'oauth' })).toHaveLength(1);

        await retriever.remove('doc:auth');
        expect(await retriever.retrieve({ text: 'oauth' })).toEqual([]);
        await retriever.remove('doc:missing'); // absent ref is not an error
      } finally {
        await cleanup();
      }
    });

    it('stems, so a query matches a different inflection of an indexed word', async () => {
      // The point of full-text over LIKE: 'migrations' in the text answers a query for 'migrate'.
      const { db, cleanup } = await freshSchema();
      try {
        const retriever = createPostgresKeywordRetriever({ db });
        await retriever.index('doc:db', 'database migrations with drizzle');
        expect((await retriever.retrieve({ text: 'migrate' }))[0]?.ref).toBe('doc:db');
      } finally {
        await cleanup();
      }
    });

    it('treats tsquery operators in user text as words, not syntax', async () => {
      // `plainto_tsquery`, not `to_tsquery`: a user typing `auth & login!` is searching, not writing
      // a query expression, and `to_tsquery` would raise a syntax error on it.
      const { db, cleanup } = await freshSchema();
      try {
        const retriever = createPostgresKeywordRetriever({ db });
        await retriever.index('doc:auth', 'authentication and login with OAuth tokens');
        await expect(retriever.retrieve({ text: 'auth & login!' })).resolves.toBeDefined();
        expect(await retriever.retrieve({ text: '' })).toEqual([]);
      } finally {
        await cleanup();
      }
    });

    it('isolates the index per tenant and per project (FR-52/FR-66)', async () => {
      const { db, cleanup } = await freshSchema();
      try {
        const base = createPostgresKeywordRetriever({ db });
        const acme = base.forTenant('acme');
        const globex = base.forTenant('globex');
        await acme.index('doc:shared', 'quarterly revenue projections alpha');
        await globex.index('doc:shared', 'unrelated beta content'); // same ref, other tenant

        expect((await acme.retrieve({ text: 'quarterly revenue' }))[0]?.ref).toBe('doc:shared');
        expect(await globex.retrieve({ text: 'quarterly revenue' })).toEqual([]);

        const p1 = acme.forProject('p1');
        const p2 = acme.forProject('p2');
        await p1.index('doc:proj', 'gamma specific text');
        expect(await p2.retrieve({ text: 'gamma' })).toEqual([]);
      } finally {
        await cleanup();
      }
    });
  });

  describe('temporal', () => {
    it('orders newest-first and scores by the shared decay curve', async () => {
      const { db, cleanup } = await freshSchema();
      try {
        const retriever = createPostgresTemporalRetriever({ db, now: () => NOW });
        await retriever.index('doc:old', NOW - 60 * DAY_MS);
        await retriever.index('doc:mid', NOW - 30 * DAY_MS);
        await retriever.index('doc:new', NOW - 1 * DAY_MS);

        const results = await retriever.retrieve({ text: 'ignored' });
        expect(results.map((r) => r.ref)).toEqual(['doc:new', 'doc:mid', 'doc:old']);

        // The 30-day half-life is the contract, not an implementation detail: fusion combines these
        // scores with other retrievers', so both adapters must produce the same number.
        const mid = results.find((r) => r.ref === 'doc:mid');
        expect(mid?.score).toBeCloseTo(0.5, 10);
      } finally {
        await cleanup();
      }
    });

    it('stores epoch millis without overflowing (bigint, not integer)', async () => {
      // Epoch ms passed 2^31 in January 1970 + 24 days; an integer column would reject every real
      // timestamp. Asserting the value round-trips exactly is what proves the column width.
      const { db, cleanup } = await freshSchema();
      try {
        const retriever = createPostgresTemporalRetriever({ db, now: () => NOW });
        await retriever.index('doc:now', NOW);
        const [hit] = await retriever.retrieve({ text: 'ignored' });
        expect(hit?.score).toBeCloseTo(1, 10); // age 0 → weight 1, so ts came back exactly
      } finally {
        await cleanup();
      }
    });

    it('rejects an unparseable timestamp before touching the database', async () => {
      const { db, cleanup } = await freshSchema();
      try {
        const retriever = createPostgresTemporalRetriever({ db });
        await expect(retriever.index('doc:x', 'not-a-date')).rejects.toThrow(
          /invalid temporal timestamp/i,
        );
      } finally {
        await cleanup();
      }
    });

    it('excludes items older than the window', async () => {
      const { db, cleanup } = await freshSchema();
      try {
        const retriever = createPostgresTemporalRetriever({
          db,
          now: () => NOW,
          windowMs: 7 * DAY_MS,
        });
        await retriever.index('doc:old', NOW - 60 * DAY_MS);
        await retriever.index('doc:new', NOW - 1 * DAY_MS);
        expect((await retriever.retrieve({ text: 'ignored' })).map((r) => r.ref)).toEqual([
          'doc:new',
        ]);
      } finally {
        await cleanup();
      }
    });
  });
});
