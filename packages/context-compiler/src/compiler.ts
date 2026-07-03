import { DEFAULT_TENANT_ID, ValidationError, type TenantId } from '@tessera/core';
import type { GraphStore } from '@tessera/knowledge-graph';
import type { HybridRetriever, RetrieverKind, SignalContribution } from '@tessera/retrieval';
import { z } from 'zod';
import type { CompilationCache } from './cache.js';
import type { CompileRequest, ContextPackage, TraceStage } from './domain.js';
import { computeCompilationKey, type CompilerFingerprint } from './key.js';
import type { FragmentSource } from './ports/fragment-source.js';
import {
  defaultRankStrategy,
  extractiveCompression,
  type CompressionStrategy,
  type RankStrategy,
} from './strategies.js';
import type { WorkingCandidate } from './stages/candidate.js';
import { planNeeds } from './stages/plan.js';
import { expandCandidates } from './stages/expand.js';
import { resolveFragments } from './stages/resolve.js';
import { dedupeFragments } from './stages/dedup.js';
import { compressToBudget } from './stages/compress.js';
import { assemble } from './stages/assemble.js';

/** Candidates retrieved per need before compilation, when the request does not specify a limit. */
const DEFAULT_RETRIEVAL_LIMIT = 20;

const requestSchema = z.object({
  task: z.string().min(1),
  budget: z.number().int().positive(),
  retrievalLimit: z.number().int().positive().optional(),
  filters: z.object({ kinds: z.array(z.string().min(1)).optional() }).optional(),
});

export interface ContextCompilerOptions {
  /** Hybrid retriever (F-009) that produces fused candidates per need. */
  readonly retriever: HybridRetriever;
  /** Resolves candidate refs to their content. */
  readonly fragmentSource: FragmentSource;
  /** Optional knowledge graph for the expand stage (effect-link traversal). */
  readonly graphStore?: GraphStore;
  /** Rank bonus per extra agreeing signal. */
  readonly multiSignalBonus?: number;
  /** Near-duplicate threshold for the dedup stage. */
  readonly dedupThreshold?: number;
  /** Max effect-link hops for the expand stage. */
  readonly expandDepth?: number;
  /** Pluggable compression strategy (FR-34; default: extractive). Swapped without any API change. */
  readonly compression?: CompressionStrategy;
  /** Pluggable ranking strategy (FR-34; default: relevance/multi-signal). Swapped without any API change. */
  readonly rankStrategy?: RankStrategy;
  /** Optional cache for compiled packages (FR-33): identical compiles are served verbatim. */
  readonly cache?: CompilationCache;
  /**
   * The tenant this compiler is scoped to (FR-52, ADR-0033). Internal (never on the wire); set via
   * {@link ContextCompiler.forTenant}. Defaults to {@link DEFAULT_TENANT_ID}. Folded into the cache key
   * so a shared cache never serves one tenant's package to another.
   */
  readonly tenantId?: TenantId;
}

/** The context compiler — the domain REST/MCP `compile_context` wraps (FR-27). */
export interface ContextCompiler {
  compile(request: CompileRequest): Promise<ContextPackage>;
  /**
   * A view of the compiler confined to `tenantId` (FR-52, ADR-0033): its retriever + graph store are
   * scoped to the tenant and the cache key is tenant-specific. Base = {@link DEFAULT_TENANT_ID}.
   */
  forTenant(tenantId: TenantId): ContextCompiler;
}

function distinctSignals(signals: readonly SignalContribution[]): RetrieverKind[] {
  const seen = new Set<RetrieverKind>();
  const kinds: RetrieverKind[] = [];
  for (const signal of signals) {
    if (!seen.has(signal.signal)) {
      seen.add(signal.signal);
      kinds.push(signal.signal);
    }
  }
  return kinds;
}

/**
 * Create a context compiler. `compile` runs plan → retrieve → expand → rank → resolve → dedup →
 * compress → assemble (ARCHITECTURE §9), recording every stage (inputs/outputs/drops) into the
 * compilation trace, and returns a provenance-tagged, budget-bounded {@link ContextPackage}.
 */
export function createContextCompiler(options: ContextCompilerOptions): ContextCompiler {
  const { retriever, fragmentSource, graphStore, cache } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const compression = options.compression ?? extractiveCompression;
  const rankStrategy: RankStrategy =
    options.rankStrategy ??
    defaultRankStrategy(
      options.multiSignalBonus === undefined ? {} : { multiSignalBonus: options.multiSignalBonus },
    );
  // The config fingerprint folded into the cache key so a strategy/knob change never returns a stale package.
  const fingerprint: CompilerFingerprint = {
    rankStrategy: rankStrategy.id,
    compressionStrategy: compression.id,
    ...(options.dedupThreshold !== undefined ? { dedupThreshold: options.dedupThreshold } : {}),
    ...(options.expandDepth !== undefined ? { expandDepth: options.expandDepth } : {}),
    // Fold a non-default tenant into the key so a shared cache stays tenant-isolated (default keeps
    // the pre-existing key so nothing changes for the single-tenant Local profile).
    ...(tenantId !== DEFAULT_TENANT_ID ? { tenantId } : {}),
  };

  async function runPipeline(request: CompileRequest): Promise<ContextPackage> {
    const stages: TraceStage[] = [];
    // Time each stage (F-016): attribute the elapsed time since the previous stage to this one.
    let mark = performance.now();
    const pushStage = (stage: Omit<TraceStage, 'durationMs'>): void => {
      const now = performance.now();
      stages.push({ ...stage, durationMs: Math.round((now - mark) * 1000) / 1000 });
      mark = now;
    };

    const needs = planNeeds(request);
    pushStage({ stage: 'plan', inputCount: 1, outputCount: needs.length, dropped: [] });

    const limit = request.retrievalLimit ?? DEFAULT_RETRIEVAL_LIMIT;
    const byRef = new Map<string, WorkingCandidate>();
    for (const need of needs) {
      for (const candidate of await retriever.search({ text: need.text, limit })) {
        const existing = byRef.get(candidate.ref);
        if (existing === undefined || candidate.score > existing.score) {
          byRef.set(candidate.ref, {
            ref: candidate.ref,
            score: candidate.score,
            signals: distinctSignals(candidate.signals),
          });
        }
      }
    }
    let candidates: WorkingCandidate[] = [...byRef.values()];
    pushStage({
      stage: 'retrieve',
      inputCount: needs.length,
      outputCount: candidates.length,
      dropped: [],
    });

    if (graphStore !== undefined) {
      const expanded = await expandCandidates(
        candidates,
        graphStore,
        options.expandDepth === undefined ? {} : { maxDepth: options.expandDepth },
      );
      pushStage({
        stage: 'expand',
        inputCount: candidates.length,
        outputCount: expanded.candidates.length,
        dropped: [],
        notes: `added ${expanded.added.length} effect-dependents`,
      });
      candidates = expanded.candidates;
    } else {
      pushStage({
        stage: 'expand',
        inputCount: candidates.length,
        outputCount: candidates.length,
        dropped: [],
        notes: 'no graph store configured',
      });
    }

    const ranked = rankStrategy.rank(candidates);
    pushStage({
      stage: 'rank',
      inputCount: candidates.length,
      outputCount: ranked.length,
      dropped: [],
    });

    const resolved = await resolveFragments(ranked, fragmentSource, request.filters);
    pushStage({
      stage: 'resolve',
      inputCount: ranked.length,
      outputCount: resolved.resolved.length,
      dropped: resolved.dropped,
    });

    const deduped = dedupeFragments(resolved.resolved, options.dedupThreshold);
    pushStage({
      stage: 'dedup',
      inputCount: resolved.resolved.length,
      outputCount: deduped.kept.length,
      dropped: deduped.dropped,
    });

    const compressed = compressToBudget(deduped.kept, request.budget, {
      query: request.task,
      compress: compression.compress,
    });
    pushStage({
      stage: 'compress',
      inputCount: deduped.kept.length,
      outputCount: compressed.selected.length,
      dropped: compressed.dropped,
      ...(compressed.compressedCount > 0
        ? {
            notes: `compressed ${compressed.compressedCount} fragment(s), saved ${compressed.tokensSaved} tokens`,
          }
        : {}),
    });

    pushStage({
      stage: 'assemble',
      inputCount: compressed.selected.length,
      outputCount: compressed.selected.length,
      dropped: [],
    });
    return assemble(request, compressed.selected, compressed.totalTokens, { stages });
  }

  return {
    async compile(request) {
      const parsed = requestSchema.safeParse(request);
      if (!parsed.success) {
        throw new ValidationError('invalid compile request', {
          details: { issues: parsed.error.issues },
        });
      }

      if (cache === undefined) return runPipeline(request);

      // Reproducible + cacheable (FR-33): key on the normalized request + config fingerprint; a hit is
      // returned verbatim (identical package), a miss is compiled once and stored.
      const key = computeCompilationKey(
        {
          task: request.task,
          budget: request.budget,
          retrievalLimit: request.retrievalLimit ?? DEFAULT_RETRIEVAL_LIMIT,
          ...(request.filters?.kinds !== undefined ? { kinds: request.filters.kinds } : {}),
        },
        fingerprint,
      );
      const cached = await cache.get(key);
      if (cached !== undefined) return cached;

      const pkg = await runPipeline(request);
      await cache.set(key, pkg);
      return pkg;
    },

    forTenant(nextTenant) {
      const scoped: ContextCompilerOptions = {
        ...options,
        tenantId: nextTenant,
        retriever: retriever.forTenant(nextTenant),
      };
      return createContextCompiler(
        graphStore === undefined
          ? scoped
          : { ...scoped, graphStore: graphStore.forTenant(nextTenant) },
      );
    },
  };
}
