import { describe, expect, it } from 'vitest';
import { diagnoseEmptyPackage } from '@/lib/inspector/diagnose';
import type { WorkspaceStats } from '@/lib/api/client';
import type { ContextPackage, TraceStage } from '@/lib/api/types';

function stage(name: string, outputCount: number, dropped: TraceStage['dropped'] = []): TraceStage {
  return { stage: name, inputCount: 1, outputCount, dropped };
}

function pkg(stages: TraceStage[], fragmentCount = 0): ContextPackage {
  return {
    task: 'How does the ledger work?',
    budget: 2000,
    totalTokens: 0,
    sections: [],
    trace: { stages },
    scores: { fragmentCount, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
  };
}

function stats(over: Partial<WorkspaceStats> = {}): WorkspaceStats {
  return {
    documents: 128,
    memories: 4,
    graph: { nodes: 200, effectLinks: 30 },
    sources: 2,
    lastScanAt: '2026-07-16T10:00:00.000Z',
    ...over,
  } as WorkspaceStats;
}

const RETRIEVE_EMPTY = [stage('plan', 1), stage('retrieve', 0)];

describe('diagnoseEmptyPackage', () => {
  it('returns nothing to explain when the package has fragments', () => {
    // A populated package needs no guidance — the scores render normally.
    expect(diagnoseEmptyPackage(pkg([stage('retrieve', 5)], 3))).toBeUndefined();
  });

  describe('retrieval matched nothing — the trace alone cannot tell us WHY', () => {
    it('names no sources when the workspace has none', () => {
      const d = diagnoseEmptyPackage(pkg(RETRIEVE_EMPTY), { stats: stats({ sources: 0 }) });

      expect(d?.cause).toBe('no-sources');
      expect(d?.action).toEqual({ kind: 'sources' });
    });

    it('distinguishes registered-but-unscanned from no sources at all', () => {
      const d = diagnoseEmptyPackage(pkg(RETRIEVE_EMPTY), {
        stats: stats({ sources: 2, documents: 0 }),
      });

      expect(d?.cause).toBe('nothing-indexed');
      expect(d?.description).toContain('registered but no documents');
      expect(d?.action).toEqual({ kind: 'sources' });
    });

    it('says the corpus has content but this task matched none of it', () => {
      const d = diagnoseEmptyPackage(pkg(RETRIEVE_EMPTY), {
        stats: stats({ sources: 2, documents: 128 }),
      });

      expect(d?.cause).toBe('no-match');
      expect(d?.description).toContain('128 documents are indexed for your sources');
      // "indexed for your sources" is what the stat MEANS. "your corpus contains" would be a claim
      // the number does not support under multi-tenant (F-060 SL-6 / F-071).
      expect(d?.description).not.toContain('corpus contains');
      // Nothing actionable to recommend — do not invent a button.
      expect(d?.action).toBeUndefined();
    });

    it('degrades to honest trace-only guidance when stats are unavailable', () => {
      // A scoped token without `stats:read` gets a 403. That must soften the copy, never block.
      const d = diagnoseEmptyPackage(pkg(RETRIEVE_EMPTY), {});

      expect(d?.cause).toBe('no-match');
      expect(d?.title).toBe('Retrieval matched nothing for this task');
      // With no stats we must NOT assert a document count we did not read.
      expect(d?.description).not.toMatch(/\d+ documents? are indexed/);
      expect(d?.action).toEqual({ kind: 'sources' });
    });

    it('treats an empty plan stage the same way', () => {
      const d = diagnoseEmptyPackage(pkg([stage('plan', 0)]), { stats: stats({ sources: 0 }) });
      expect(d?.cause).toBe('no-sources');
    });
  });

  describe('filters excluded everything', () => {
    it('names the filter when the UI applied one and resolve emptied', () => {
      const d = diagnoseEmptyPackage(
        pkg([stage('retrieve', 8), stage('rank', 8), stage('resolve', 0)]),
        { filtersApplied: true },
      );

      expect(d?.cause).toBe('filters-excluded-everything');
      expect(d?.action).toEqual({ kind: 'clear-filters' });
      // The form must not imply the filter fetches more of the chosen kind — it narrows what was
      // already retrieved, which is why filtering can empty a package that would otherwise fill.
      expect(d?.description).toContain('narrow what was already retrieved');
    });

    it('does NOT blame filters that were never applied', () => {
      const d = diagnoseEmptyPackage(
        pkg([
          stage('retrieve', 8),
          stage('resolve', 0, [{ ref: 'r', reason: 'no content for ref' }]),
        ]),
        { filtersApplied: false },
      );

      // Resolve emptied for some other reason (e.g. refs with no corpus content). Blaming a filter
      // the user never set would send them to fix the wrong thing.
      expect(d?.cause).not.toBe('filters-excluded-everything');
    });
  });

  describe('nothing fit the budget', () => {
    it("quotes the compiler's own reason rather than paraphrasing it", () => {
      const d = diagnoseEmptyPackage(
        pkg([
          stage('retrieve', 8),
          stage('resolve', 4),
          stage('dedup', 3),
          stage('compress', 0, [
            { ref: 'r', reason: 'exceeds budget (needs 900 tokens, 120 remaining)' },
          ]),
        ]),
      );

      expect(d?.cause).toBe('nothing-fit-budget');
      expect(d?.description).toContain('exceeds budget (needs 900 tokens, 120 remaining)');
      expect(d?.action).toEqual({ kind: 'raise-budget' });
    });

    it('still explains itself when the compress stage recorded no reason', () => {
      const d = diagnoseEmptyPackage(
        pkg([stage('retrieve', 8), stage('resolve', 4), stage('compress', 0)]),
      );

      expect(d?.cause).toBe('nothing-fit-budget');
      expect(d?.description).toContain('none fit within the requested budget');
      expect(d?.description).not.toContain('undefined');
    });
  });

  it('degrades to a generic honest message when no stage is recognised', () => {
    // Stage names are string literals on the wire, not an exported enum — a soft contract. If one
    // is renamed upstream, guidance must point at the trace, never mis-diagnose and never crash.
    const d = diagnoseEmptyPackage(pkg([stage('some-future-stage', 0)]));

    expect(d?.cause).toBe('unknown');
    expect(d?.description).toContain('trace below');
    expect(d?.action).toBeUndefined();
  });

  it('degrades gracefully on a trace with no stages at all', () => {
    const d = diagnoseEmptyPackage(pkg([]));
    expect(d?.cause).toBe('unknown');
  });
});
