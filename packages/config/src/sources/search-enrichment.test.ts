import type { FragmentSource, SourceFragment } from '@tessera/context-compiler';
import type { FusedCandidate, HybridRetriever, RetrievalQuery } from '@tessera/retrieval';
import { describe, expect, it, vi } from 'vitest';
import { createEnrichedRetriever } from './search-enrichment.js';

const FILE_REF = 'sha-of-src-reporting-ledger';
const MEMORY_REF = 'memory/lineage-1';
const NODE_REF = 'sha-of-graph-node';

const CORPUS: Record<string, SourceFragment> = {
  [FILE_REF]: {
    ref: FILE_REF,
    kind: 'code',
    text: 'export function postEntry() { return ledger.append(entry); }',
    metadata: { sourceId: 's1', path: 'src/reporting/ledger.ts' },
  },
  [MEMORY_REF]: {
    ref: MEMORY_REF,
    kind: 'memory',
    text: 'Use SQLite locally\nZero external dependencies for the local profile.',
    metadata: { lineageId: 'lineage-1', kind: 'decision', title: 'Use SQLite locally' },
  },
};

const fragments: FragmentSource = {
  get: (ref) => Promise.resolve(CORPUS[ref]),
};

function candidate(ref: string, over: Partial<FusedCandidate> = {}): FusedCandidate {
  return {
    ref,
    score: 1,
    signals: [{ signal: 'keyword', rank: 1, score: 1, weight: 1, contribution: 0.016 }],
    ...over,
  };
}

/** A retriever returning fixed fused candidates, recording the query it was handed. */
function innerWith(
  results: readonly FusedCandidate[],
): HybridRetriever & { last?: RetrievalQuery } {
  const inner = {
    last: undefined as RetrievalQuery | undefined,
    search(query: RetrievalQuery) {
      inner.last = query;
      return Promise.resolve(results);
    },
    forTenant() {
      return inner;
    },
  };
  return inner;
}

describe('createEnrichedRetriever', () => {
  it('labels an ingested file by its path — the fix for hash-titled results (F-073)', async () => {
    const retriever = createEnrichedRetriever(innerWith([candidate(FILE_REF)]), fragments);

    const [result] = await retriever.search({ text: 'ledger' });

    // Before F-061/F-073 this rendered as a 64-char hash and the row was a dead end. The label is
    // the one enrichment that is ALWAYS on — a hash is not an answer at any token price.
    expect(result!.label).toBe('src/reporting/ledger.ts');
  });

  it('attaches ONLY the label by default — every other extra is opt-in (NFR-4)', async () => {
    const retriever = createEnrichedRetriever(innerWith([candidate(FILE_REF)]), fragments);

    const [result] = await retriever.search({ text: 'ledger' });

    // A ranked answer is billed to every caller on every call. Measured on 10 results: kind +35,
    // node +135, snippet ~+200 — enough to breach the NFR-4 budget, so none of them ride by default.
    expect(result!.label).toBeDefined();
    expect(result!.kind).toBeUndefined();
    expect(result!.node).toBeUndefined();
    expect(result!.snippet).toBeUndefined();
  });

  it('classifies a hit when kind is asked for', async () => {
    const retriever = createEnrichedRetriever(
      innerWith([candidate(FILE_REF), candidate(MEMORY_REF)]),
      fragments,
    );

    const results = await retriever.search({ text: 'ledger', include: { kind: true } });

    expect(results.map((r) => r.kind)).toEqual(['file', 'memory']);
  });

  it('gives a file result the graph node GET /v1/effects is keyed by (extensionless key)', async () => {
    const retriever = createEnrichedRetriever(innerWith([candidate(FILE_REF)]), fragments);

    const [result] = await retriever.search({ text: 'ledger', include: { node: true } });

    // The effects route takes {kind, key}, and a file node's key is the EXTENSIONLESS path
    // (ADR-0041) — deriving it here is what makes "show effects" reachable from a search hit.
    expect(result!.node).toEqual({ kind: 'file', key: 'src/reporting/ledger' });
  });

  it('titles a memory by its title and gives it no node even when asked', async () => {
    const retriever = createEnrichedRetriever(innerWith([candidate(MEMORY_REF)]), fragments);

    const [result] = await retriever.search({
      text: 'sqlite',
      include: { kind: true, node: true },
    });

    expect(result!.label).toBe('Use SQLite locally');
    expect(result!.kind).toBe('memory');
    // A memory has no graph node — the UI must omit the action, not offer one that cannot work.
    expect(result!.node).toBeUndefined();
  });

  it('passes a ref with no fragment through UNCHANGED, never dropping it', async () => {
    // Graph/symbolic hits are node ids in a different ref space and were never written to the
    // corpus. Dropping them would silently delete the graph signal from every search.
    const graphHit = candidate(NODE_REF, {
      label: 'ledger.ts',
      signals: [{ signal: 'graph', rank: 1, score: 0.9, weight: 1, contribution: 0.016 }],
    });
    const retriever = createEnrichedRetriever(innerWith([graphHit]), fragments);

    const results = await retriever.search({ text: 'ledger', include: { kind: true } });

    expect(results).toHaveLength(1);
    expect(results[0]!.ref).toBe(NODE_REF);
    expect(results[0]!.label).toBe('ledger.ts'); // the retriever's own label survives
    expect(results[0]!.kind).toBe('symbol');
    expect(results[0]!.signals).toEqual(graphHit.signals);
  });

  it("keeps the retriever's own label — it is closer to the signal that matched", async () => {
    const withLabel = candidate(FILE_REF, { label: 'ledger.ts' });
    const retriever = createEnrichedRetriever(innerWith([withLabel]), fragments);

    const [result] = await retriever.search({ text: 'ledger' });

    expect(result!.label).toBe('ledger.ts');
  });

  it('returns a query-relevant snippet with offsets when asked', async () => {
    const retriever = createEnrichedRetriever(innerWith([candidate(FILE_REF)]), fragments);

    const [result] = await retriever.search({ text: 'ledger', include: { snippet: {} } });

    expect(result!.snippet).toBeDefined();
    const { text, matches } = result!.snippet!;
    expect(matches.length).toBeGreaterThan(0);
    // The offsets index the snippet's own text — proven by reading them back.
    expect(text.slice(matches[0]!.start, matches[0]!.end)).toBe('ledger');
  });

  it('honours the snippet maxChars ceiling', async () => {
    const retriever = createEnrichedRetriever(innerWith([candidate(FILE_REF)]), fragments);

    const [result] = await retriever.search({
      text: 'ledger',
      include: { snippet: { maxChars: 40 } },
    });

    expect(result!.snippet!.text.length).toBeLessThanOrEqual(40);
  });

  it('preserves ranking, score and signal attribution exactly', async () => {
    const first = candidate(FILE_REF, { score: 0.9 });
    const second = candidate(MEMORY_REF, { score: 0.4 });
    const retriever = createEnrichedRetriever(innerWith([first, second]), fragments);

    const results = await retriever.search({ text: 'ledger' });

    // Enrichment decorates; it must never reorder or re-score. Ranking is the retriever's job.
    expect(results.map((r) => r.ref)).toEqual([FILE_REF, MEMORY_REF]);
    expect(results.map((r) => r.score)).toEqual([0.9, 0.4]);
    expect(results[0]!.signals).toEqual(first.signals);
  });

  it('forTenant rebinds the inner retriever', async () => {
    const scoped = innerWith([candidate(FILE_REF)]);
    const inner = {
      search: vi.fn(() => Promise.resolve([])),
      forTenant: vi.fn(() => scoped),
    } satisfies HybridRetriever;

    const retriever = createEnrichedRetriever(inner, fragments);
    const view = retriever.forTenant('acme');
    const [result] = await view.search({ text: 'ledger' });

    expect(inner.forTenant).toHaveBeenCalledWith('acme');
    // Enrichment survives the rebinding, and only looks up refs the scoped view returned.
    expect(result!.label).toBe('src/reporting/ledger.ts');
  });

  it('passes the query through to the inner retriever untouched', async () => {
    const inner = innerWith([]);
    const retriever = createEnrichedRetriever(inner, fragments);

    await retriever.search({ text: 'ledger', limit: 5, include: { snippet: { maxChars: 80 } } });

    expect(inner.last).toMatchObject({ text: 'ledger', limit: 5 });
  });

  it('survives a fragment with no metadata rather than throwing', async () => {
    const bare: FragmentSource = {
      get: (ref) => Promise.resolve({ ref, kind: 'code', text: 'const a = 1;' }),
    };
    const retriever = createEnrichedRetriever(innerWith([candidate(FILE_REF)]), bare);

    const [result] = await retriever.search({ text: 'a', include: { kind: true, node: true } });

    expect(result!.kind).toBe('file');
    expect(result!.label).toBeUndefined(); // no path to label with — say nothing, invent nothing
    expect(result!.node).toBeUndefined();
  });
});
