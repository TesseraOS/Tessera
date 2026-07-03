import { describe, expect, it } from 'vitest';
import { createSqliteStore } from '@tessera/storage';
import { createHybridRetriever } from '../../src/service/hybrid-retriever';
import { createKeywordRetriever } from '../../src/adapters/keyword-retriever';
import {
  DEFAULT_TEMPORAL_HALF_LIFE_MS,
  createTemporalRetriever,
  type TemporalRetrieverOptions,
} from '../../src/adapters/temporal-retriever';
import { runRetrieverConformance } from '../conformance/retriever.conformance';

const NOW = Date.parse('2026-07-02T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const fixedNow = () => NOW;

function setup(overrides: Partial<TemporalRetrieverOptions> = {}) {
  const sqlite = createSqliteStore({ path: ':memory:' });
  const retriever = createTemporalRetriever({ db: sqlite.db, now: fixedNow, ...overrides });
  retriever.index('doc:old', NOW - 60 * DAY_MS);
  retriever.index('doc:mid', NOW - 30 * DAY_MS);
  retriever.index('doc:new', NOW - 1 * DAY_MS);
  return { sqlite, retriever };
}

runRetrieverConformance('temporal', 'temporal', () => {
  const { sqlite, retriever } = setup();
  return Promise.resolve({ retriever, query: 'anything', cleanup: () => sqlite.close() });
});

describe('temporal retriever (recency)', () => {
  it('orders candidates newest-first, independent of the query text', async () => {
    const { sqlite, retriever } = setup();
    try {
      const candidates = await retriever.retrieve({ text: 'ignored query text' });
      expect(candidates.map((candidate) => candidate.ref)).toEqual([
        'doc:new',
        'doc:mid',
        'doc:old',
      ]);
      expect(candidates.every((candidate) => candidate.signal === 'temporal')).toBe(true);
    } finally {
      await sqlite.close();
    }
  });

  it('scores by exponential recency decay (half-life → 0.5), monotonic with age', async () => {
    const { sqlite, retriever } = setup({ halfLifeMs: DEFAULT_TEMPORAL_HALF_LIFE_MS });
    try {
      const byRef = new Map(
        (await retriever.retrieve({ text: 'q' })).map((candidate) => [
          candidate.ref,
          candidate.score,
        ]),
      );
      // doc:mid is exactly one half-life (30d) old → 0.5.
      expect(byRef.get('doc:mid')).toBeCloseTo(0.5, 5);
      expect(byRef.get('doc:new')).toBeGreaterThan(byRef.get('doc:mid') ?? 0);
      expect(byRef.get('doc:old')).toBeLessThan(byRef.get('doc:mid') ?? 1);
      for (const score of byRef.values()) {
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    } finally {
      await sqlite.close();
    }
  });

  it('excludes items older than the time window', async () => {
    const { sqlite, retriever } = setup({ windowMs: 40 * DAY_MS });
    try {
      const refs = (await retriever.retrieve({ text: 'q' })).map((candidate) => candidate.ref);
      expect(refs).toEqual(['doc:new', 'doc:mid']); // doc:old (60d) is outside the 40d window
    } finally {
      await sqlite.close();
    }
  });

  it('respects the limit, re-indexes a ref idempotently, and removes', async () => {
    const { sqlite, retriever } = setup();
    try {
      expect(await retriever.retrieve({ text: 'q', limit: 1 })).toHaveLength(1);

      retriever.index('doc:old', NOW); // bump the oldest to now → it becomes the newest
      expect((await retriever.retrieve({ text: 'q' }))[0]?.ref).toBe('doc:old');
      expect(await retriever.retrieve({ text: 'q' })).toHaveLength(3); // still one row per ref

      retriever.remove('doc:old');
      expect((await retriever.retrieve({ text: 'q' })).some((c) => c.ref === 'doc:old')).toBe(
        false,
      );
    } finally {
      await sqlite.close();
    }
  });

  it('isolates the recency index by tenant (forTenant)', async () => {
    const { sqlite, retriever } = setup();
    try {
      const a = retriever.forTenant('tenant-a');
      const b = retriever.forTenant('tenant-b');
      a.index('doc:shared', NOW - 5 * DAY_MS);
      b.index('doc:shared', NOW - 5 * DAY_MS); // same ref, different tenant

      expect((await a.retrieve({ text: 'q' })).map((c) => c.ref)).toEqual(['doc:shared']);
      expect((await b.retrieve({ text: 'q' })).map((c) => c.ref)).toEqual(['doc:shared']);

      // Removing in A leaves B (and the base tenant) untouched.
      a.remove('doc:shared');
      expect(await a.retrieve({ text: 'q' })).toEqual([]);
      expect((await b.retrieve({ text: 'q' })).map((c) => c.ref)).toEqual(['doc:shared']);
      expect((await retriever.retrieve({ text: 'q' })).map((c) => c.ref)).toEqual([
        'doc:new',
        'doc:mid',
        'doc:old',
      ]);
    } finally {
      await sqlite.close();
    }
  });

  it('rejects an invalid timestamp', () => {
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      const retriever = createTemporalRetriever({ db: sqlite.db, now: fixedNow });
      expect(() => retriever.index('doc:x', 'not-a-date')).toThrow(/invalid temporal timestamp/i);
    } finally {
      void sqlite.close();
    }
  });

  it('contributes a temporal signal to fusion, boosting a recent item', async () => {
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      const keyword = createKeywordRetriever({ db: sqlite.db });
      keyword.index('doc:old', 'shared topic alpha');
      keyword.index('doc:new', 'shared topic alpha');

      const temporal = createTemporalRetriever({ db: sqlite.db, now: fixedNow });
      temporal.index('doc:old', NOW - 90 * DAY_MS);
      temporal.index('doc:new', NOW - 1 * DAY_MS);

      const fused = await createHybridRetriever([keyword, temporal]).search({
        text: 'alpha topic',
      });
      expect(fused[0]?.ref).toBe('doc:new');
      const signals = fused.find((c) => c.ref === 'doc:new')?.signals.map((s) => s.signal) ?? [];
      expect(signals).toContain('temporal');
      expect(signals).toContain('keyword');
    } finally {
      await sqlite.close();
    }
  });
});
