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

  it('changes when the tenant changes (data-plane isolation)', () => {
    const base = computeCompilationKey({ task: 't', budget: 100, retrievalLimit: 20 }, FP);
    const a = computeCompilationKey(
      { task: 't', budget: 100, retrievalLimit: 20 },
      { ...FP, tenantId: 'tenant-a' },
    );
    const b = computeCompilationKey(
      { task: 't', budget: 100, retrievalLimit: 20 },
      { ...FP, tenantId: 'tenant-b' },
    );
    expect(a).not.toBe(base);
    expect(a).not.toBe(b);
  });

  it('changes when the project changes within a tenant (project isolation)', () => {
    const tenant = { ...FP, tenantId: 'tenant-a' };
    const base = computeCompilationKey({ task: 't', budget: 100, retrievalLimit: 20 }, tenant);
    const p1 = computeCompilationKey(
      { task: 't', budget: 100, retrievalLimit: 20 },
      { ...tenant, projectId: 'project-1' },
    );
    const p2 = computeCompilationKey(
      { task: 't', budget: 100, retrievalLimit: 20 },
      { ...tenant, projectId: 'project-2' },
    );
    // Same task, same tenant, different projects → distinct keys (and distinct from the default project).
    expect(p1).not.toBe(base);
    expect(p1).not.toBe(p2);
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
