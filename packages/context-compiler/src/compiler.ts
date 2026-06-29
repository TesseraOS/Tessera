import { ValidationError } from '@tessera/core';
import type { GraphStore } from '@tessera/knowledge-graph';
import type { HybridRetriever, RetrieverKind, SignalContribution } from '@tessera/retrieval';
import { z } from 'zod';
import type { CompileRequest, ContextPackage, TraceStage } from './domain.js';
import type { FragmentSource } from './ports/fragment-source.js';
import type { WorkingCandidate } from './stages/candidate.js';
import { planNeeds } from './stages/plan.js';
import { expandCandidates } from './stages/expand.js';
import { rankCandidates } from './stages/rank.js';
import { resolveFragments } from './stages/resolve.js';
import { dedupeFragments } from './stages/dedup.js';
import { fitToBudget } from './stages/compress.js';
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
}

/** The context compiler — the domain REST/MCP `compile_context` wraps (FR-27). */
export interface ContextCompiler {
  compile(request: CompileRequest): Promise<ContextPackage>;
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
  const { retriever, fragmentSource, graphStore } = options;

  return {
    async compile(request) {
      const parsed = requestSchema.safeParse(request);
      if (!parsed.success) {
        throw new ValidationError('invalid compile request', {
          details: { issues: parsed.error.issues },
        });
      }

      const stages: TraceStage[] = [];

      const needs = planNeeds(request);
      stages.push({ stage: 'plan', inputCount: 1, outputCount: needs.length, dropped: [] });

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
      stages.push({
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
        stages.push({
          stage: 'expand',
          inputCount: candidates.length,
          outputCount: expanded.candidates.length,
          dropped: [],
          notes: `added ${expanded.added.length} effect-dependents`,
        });
        candidates = expanded.candidates;
      } else {
        stages.push({
          stage: 'expand',
          inputCount: candidates.length,
          outputCount: candidates.length,
          dropped: [],
          notes: 'no graph store configured',
        });
      }

      const ranked = rankCandidates(
        candidates,
        options.multiSignalBonus === undefined
          ? {}
          : { multiSignalBonus: options.multiSignalBonus },
      );
      stages.push({
        stage: 'rank',
        inputCount: candidates.length,
        outputCount: ranked.length,
        dropped: [],
      });

      const resolved = await resolveFragments(ranked, fragmentSource, request.filters);
      stages.push({
        stage: 'resolve',
        inputCount: ranked.length,
        outputCount: resolved.resolved.length,
        dropped: resolved.dropped,
      });

      const deduped = dedupeFragments(resolved.resolved, options.dedupThreshold);
      stages.push({
        stage: 'dedup',
        inputCount: resolved.resolved.length,
        outputCount: deduped.kept.length,
        dropped: deduped.dropped,
      });

      const compressed = fitToBudget(deduped.kept, request.budget);
      stages.push({
        stage: 'compress',
        inputCount: deduped.kept.length,
        outputCount: compressed.selected.length,
        dropped: compressed.dropped,
      });

      stages.push({
        stage: 'assemble',
        inputCount: compressed.selected.length,
        outputCount: compressed.selected.length,
        dropped: [],
      });
      return assemble(request, compressed.selected, compressed.totalTokens, { stages });
    },
  };
}
