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

/**
 * A scope-aware fake corpus (ADR-0067): fragments live under a `(tenant/project)` and a view bound
 * elsewhere resolves whatever THAT scope holds — the shape `createBlobFragmentSource` has.
 *
 * Keyed by scope rather than by a single `home` so a test can plant a **decoy**. Without one, "a view
 * bound elsewhere sees nothing" is satisfied by the other scope being empty, and the assertion stays
 * green even when the rebinding it guards is deleted.
 */
function fakeFragments(
  byScope: Record<string, Record<string, SourceFragment>>,
  view = 'default/default',
): FragmentSource {
  return {
    get: (ref) => Promise.resolve(byScope[view]?.[ref]),
    forTenant: (tenantId) => fakeFragments(byScope, `${tenantId}/default`),
    forProject: (projectId) => fakeFragments(byScope, `${view.split('/')[0] ?? ''}/${projectId}`),
  };
}

/** A different body at the SAME ref, for planting under another scope. */
const DECOY_CORPUS: Record<string, SourceFragment> = {
  [FILE_REF]: {
    ref: FILE_REF,
    kind: 'code',
    text: 'a body belonging to a different scope entirely',
    metadata: { sourceId: 'other', path: 'src/globex/other.ts' },
  },
};

const fragments: FragmentSource = fakeFragments({ 'default/default': CORPUS });

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

  it('forTenant rebinds BOTH halves — the retriever and the corpus', async () => {
    const scoped = innerWith([candidate(FILE_REF)]);
    const inner = {
      search: vi.fn(() => Promise.resolve([])),
      forTenant: vi.fn(() => scoped),
    } satisfies HybridRetriever;

    // The corpus lives under `acme`, so the acme label can only appear if the FragmentSource was
    // rebound too — and the DECOY under the base scope means an unrebound view returns the wrong
    // label rather than none, so this fails loudly instead of quietly.
    const retriever = createEnrichedRetriever(
      inner,
      fakeFragments({ 'acme/default': CORPUS, 'default/default': DECOY_CORPUS }),
    );
    const view = retriever.forTenant('acme');
    const [result] = await view.search({ text: 'ledger' });

    expect(inner.forTenant).toHaveBeenCalledWith('acme');
    expect(result!.label).toBe('src/reporting/ledger.ts');
  });

  it('a view bound to another tenant never enriches from a corpus it does not own', async () => {
    // The IDOR guard in miniature: same ref, different scope. The candidate is still returned (never
    // dropped) — it just cannot be enriched from a corpus it does not own.
    //
    // globex holds its OWN fragment at this ref, so the assertion is "gets globex's label, never
    // acme's" rather than "gets nothing". Written the other way it passed by emptiness: with globex
    // absent from the fixture, deleting the corpus rebinding left it green.
    const scoped = innerWith([candidate(FILE_REF)]);
    const inner = {
      search: vi.fn(() => Promise.resolve([])),
      forTenant: vi.fn(() => scoped),
    } satisfies HybridRetriever;

    const retriever = createEnrichedRetriever(
      inner,
      fakeFragments({ 'acme/default': CORPUS, 'globex/default': DECOY_CORPUS }),
    );
    const [result] = await retriever.forTenant('globex').search({ text: 'ledger' });

    expect(result!.ref).toBe(FILE_REF);
    expect(result!.label).toBe('src/globex/other.ts');
  });

  it('passes the query through to the inner retriever untouched', async () => {
    const inner = innerWith([]);
    const retriever = createEnrichedRetriever(inner, fragments);

    await retriever.search({ text: 'ledger', limit: 5, include: { snippet: { maxChars: 80 } } });

    expect(inner.last).toMatchObject({ text: 'ledger', limit: 5 });
  });

  it('survives a fragment with no metadata rather than throwing', async () => {
    const bare: FragmentSource = fakeFragments({
      'default/default': { [FILE_REF]: { ref: FILE_REF, kind: 'code', text: 'const a = 1;' } },
    });
    const retriever = createEnrichedRetriever(innerWith([candidate(FILE_REF)]), bare);

    const [result] = await retriever.search({ text: 'a', include: { kind: true, node: true } });

    expect(result!.kind).toBe('file');
    expect(result!.label).toBeUndefined(); // no path to label with — say nothing, invent nothing
    expect(result!.node).toBeUndefined();
  });
});
