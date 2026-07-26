import { describe, expect, it } from 'vitest';
import { createSqliteStore } from '@tessera/storage';
import { createKeywordRetriever } from '../../src/adapters/keyword-retriever';
import { runRetrieverConformance } from '../conformance/retriever.conformance';

async function setup() {
  const sqlite = createSqliteStore({ path: ':memory:' });
  const retriever = createKeywordRetriever({ db: sqlite.db });
  await retriever.index('doc:auth', 'authentication and login with OAuth tokens');
  await retriever.index('doc:db', 'database migrations with drizzle and sqlite');
  return { sqlite, retriever };
}

runRetrieverConformance('keyword', 'keyword', async () => {
  const { sqlite, retriever } = await setup();
  return Promise.resolve({ retriever, query: 'oauth tokens', cleanup: () => sqlite.close() });
});

describe('keyword retriever (FTS5)', () => {
  it('matches documents by term and re-indexes idempotently', async () => {
    const { sqlite, retriever } = await setup();
    try {
      expect((await retriever.retrieve({ text: 'drizzle migrations' }))[0]?.ref).toBe('doc:db');
      expect((await retriever.retrieve({ text: 'oauth' }))[0]?.ref).toBe('doc:auth');

      await retriever.index('doc:auth', 'authentication and login with OAuth tokens'); // re-index same ref
      expect(await retriever.retrieve({ text: 'oauth' })).toHaveLength(1);
    } finally {
      await sqlite.close();
    }
  });

  it('removes a document from the index (document removal)', async () => {
    const { sqlite, retriever } = await setup();
    try {
      expect((await retriever.retrieve({ text: 'oauth' })).map((c) => c.ref)).toEqual(['doc:auth']);
      await retriever.remove('doc:auth');
      expect(await retriever.retrieve({ text: 'oauth' })).toEqual([]);
      // Other documents are untouched; removing an absent ref is a no-op.
      expect((await retriever.retrieve({ text: 'drizzle' })).map((c) => c.ref)).toEqual(['doc:db']);
      await retriever.remove('doc:missing');
    } finally {
      await sqlite.close();
    }
  });

  it('returns no results for a termless query', async () => {
    const { sqlite, retriever } = await setup();
    try {
      expect(await retriever.retrieve({ text: '   ...   ' })).toEqual([]);
    } finally {
      await sqlite.close();
    }
  });

  it('isolates the FTS index by tenant (forTenant)', async () => {
    const { sqlite, retriever } = await setup();
    try {
      const a = retriever.forTenant('tenant-a');
      const b = retriever.forTenant('tenant-b');
      await a.index('doc:shared', 'quarterly revenue projections alpha');
      await b.index('doc:shared', 'unrelated beta content'); // same ref, different tenant

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

  it('isolates the FTS index by project (forProject) within a tenant', async () => {
    const { sqlite, retriever } = await setup();
    try {
      const tenant = retriever.forTenant('tenant-a');
      const p1 = tenant.forProject('project-1');
      const p2 = tenant.forProject('project-2');
      await p1.index('doc:shared', 'quarterly revenue projections alpha');
      await p2.index('doc:shared', 'unrelated beta content'); // same ref, different project

      expect((await p1.retrieve({ text: 'revenue projections' })).map((c) => c.ref)).toEqual([
        'doc:shared',
      ]);
      // Project 2 never sees project 1's content, even for the same ref.
      expect(await p2.retrieve({ text: 'revenue projections' })).toEqual([]);
      expect((await p2.retrieve({ text: 'beta content' })).map((c) => c.ref)).toEqual([
        'doc:shared',
      ]);
      // The tenant's default project is a distinct scope and sees neither.
      expect(await tenant.retrieve({ text: 'revenue projections' })).toEqual([]);
      expect(await tenant.retrieve({ text: 'beta content' })).toEqual([]);
    } finally {
      await sqlite.close();
    }
  });
});
