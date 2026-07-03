import { describe, expect, it } from 'vitest';
import { createSqliteStore } from '@tessera/storage';
import { createKeywordRetriever } from '../../src/adapters/keyword-retriever';
import { runRetrieverConformance } from '../conformance/retriever.conformance';

function setup() {
  const sqlite = createSqliteStore({ path: ':memory:' });
  const retriever = createKeywordRetriever({ db: sqlite.db });
  retriever.index('doc:auth', 'authentication and login with OAuth tokens');
  retriever.index('doc:db', 'database migrations with drizzle and sqlite');
  return { sqlite, retriever };
}

runRetrieverConformance('keyword', 'keyword', () => {
  const { sqlite, retriever } = setup();
  return Promise.resolve({ retriever, query: 'oauth tokens', cleanup: () => sqlite.close() });
});

describe('keyword retriever (FTS5)', () => {
  it('matches documents by term and re-indexes idempotently', async () => {
    const { sqlite, retriever } = setup();
    try {
      expect((await retriever.retrieve({ text: 'drizzle migrations' }))[0]?.ref).toBe('doc:db');
      expect((await retriever.retrieve({ text: 'oauth' }))[0]?.ref).toBe('doc:auth');

      retriever.index('doc:auth', 'authentication and login with OAuth tokens'); // re-index same ref
      expect(await retriever.retrieve({ text: 'oauth' })).toHaveLength(1);
    } finally {
      await sqlite.close();
    }
  });

  it('returns no results for a termless query', async () => {
    const { sqlite, retriever } = setup();
    try {
      expect(await retriever.retrieve({ text: '   ...   ' })).toEqual([]);
    } finally {
      await sqlite.close();
    }
  });

  it('isolates the FTS index by tenant (forTenant)', async () => {
    const { sqlite, retriever } = setup();
    try {
      const a = retriever.forTenant('tenant-a');
      const b = retriever.forTenant('tenant-b');
      a.index('doc:shared', 'quarterly revenue projections alpha');
      b.index('doc:shared', 'unrelated beta content'); // same ref, different tenant

      expect((await a.retrieve({ text: 'revenue projections' })).map((c) => c.ref)).toEqual([
        'doc:shared',
      ]);
      // Tenant B never sees A's content, even for the same ref.
      expect(await b.retrieve({ text: 'revenue projections' })).toEqual([]);
      expect((await b.retrieve({ text: 'beta content' })).map((c) => c.ref)).toEqual([
        'doc:shared',
      ]);
      // The default (base) retriever is a distinct tenant and sees neither.
      expect(await retriever.retrieve({ text: 'revenue projections' })).toEqual([]);
      expect(await retriever.retrieve({ text: 'beta content' })).toEqual([]);
    } finally {
      await sqlite.close();
    }
  });
});
