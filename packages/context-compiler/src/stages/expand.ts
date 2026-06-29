import type { GraphStore, NodeId } from '@tessera/knowledge-graph';
import type { WorkingCandidate } from './candidate.js';

export interface ExpandResult {
  readonly candidates: WorkingCandidate[];
  readonly added: WorkingCandidate[];
}

export interface ExpandOptions {
  readonly maxDepth?: number;
}

/**
 * Expand stage (ARCHITECTURE §9): for each candidate, follow effect-links via `get_effects` to pull
 * in dependents that should be reviewed alongside it. Best-effort — a ref that is not a graph node
 * simply yields no effects. Expanded candidates carry the traversal score and `expandedFrom`.
 */
export async function expandCandidates(
  candidates: readonly WorkingCandidate[],
  graphStore: GraphStore,
  options: ExpandOptions = {},
): Promise<ExpandResult> {
  const byRef = new Map<string, WorkingCandidate>(candidates.map((c) => [c.ref, c]));
  const added: WorkingCandidate[] = [];
  const effectOptions = options.maxDepth === undefined ? undefined : { maxDepth: options.maxDepth };

  for (const candidate of candidates) {
    const hits = await graphStore.getEffects(candidate.ref as NodeId, effectOptions);
    for (const hit of hits) {
      if (byRef.has(hit.nodeId)) continue;
      const expanded: WorkingCandidate = {
        ref: hit.nodeId,
        score: candidate.score * hit.score,
        signals: ['graph'],
        expandedFrom: candidate.ref,
      };
      byRef.set(hit.nodeId, expanded);
      added.push(expanded);
    }
  }

  return { candidates: [...byRef.values()], added };
}
