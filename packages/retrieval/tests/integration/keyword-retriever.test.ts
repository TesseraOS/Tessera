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
});
