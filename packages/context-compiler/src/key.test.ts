import { describe, expect, it } from 'vitest';
import { computeCompilationKey, type CompilerFingerprint } from './key.js';

const FP: CompilerFingerprint = { rankStrategy: 'relevance', compressionStrategy: 'extractive' };

describe('computeCompilationKey', () => {
  it('is deterministic and sha256-shaped', () => {
    const a = computeCompilationKey({ task: 't', budget: 100, retrievalLimit: 20 }, FP);
    const b = computeCompilationKey({ task: 't', budget: 100, retrievalLimit: 20 }, FP);

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any output-affecting input changes', () => {
    const base = computeCompilationKey({ task: 't', budget: 100, retrievalLimit: 20 }, FP);

    expect(computeCompilationKey({ task: 'other', budget: 100, retrievalLimit: 20 }, FP)).not.toBe(
      base,
    );
    expect(computeCompilationKey({ task: 't', budget: 101, retrievalLimit: 20 }, FP)).not.toBe(
      base,
    );
    expect(computeCompilationKey({ task: 't', budget: 100, retrievalLimit: 21 }, FP)).not.toBe(
      base,
    );
    expect(
      computeCompilationKey({ task: 't', budget: 100, retrievalLimit: 20, kinds: ['code'] }, FP),
    ).not.toBe(base);
    expect(
      computeCompilationKey(
        { task: 't', budget: 100, retrievalLimit: 20 },
        { ...FP, compressionStrategy: 'llm' },
      ),
    ).not.toBe(base);
    expect(
      computeCompilationKey(
        { task: 't', budget: 100, retrievalLimit: 20 },
        { ...FP, rankStrategy: 'custom' },
      ),
    ).not.toBe(base);
    expect(
      computeCompilationKey(
        { task: 't', budget: 100, retrievalLimit: 20 },
        { ...FP, dedupThreshold: 0.5 },
      ),
    ).not.toBe(base);
  });

  it('is order-independent for filter kinds', () => {
    const a = computeCompilationKey(
      { task: 't', budget: 100, retrievalLimit: 20, kinds: ['code', 'memory'] },
      FP,
    );
    const b = computeCompilationKey(
      { task: 't', budget: 100, retrievalLimit: 20, kinds: ['memory', 'code'] },
      FP,
    );

    expect(a).toBe(b);
  });
});
