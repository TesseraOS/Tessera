import type { ContextFilters, TraceDrop } from '../domain.js';
import type { FragmentSource, SourceFragment } from '../ports/fragment-source.js';
import type { WorkingCandidate } from './candidate.js';

/** A ranked candidate paired with its resolved content. */
export interface ResolvedCandidate {
  readonly candidate: WorkingCandidate;
  readonly fragment: SourceFragment;
}

export interface ResolveResult {
  readonly resolved: ResolvedCandidate[];
  readonly dropped: TraceDrop[];
}

/**
 * Resolve each candidate's content via the {@link FragmentSource}, preserving rank order. Refs with
 * no content, or whose kind is excluded by the request filters, are dropped (and traced).
 */
export async function resolveFragments(
  candidates: readonly WorkingCandidate[],
  source: FragmentSource,
  filters?: ContextFilters,
): Promise<ResolveResult> {
  const kinds = filters?.kinds === undefined ? undefined : new Set(filters.kinds);
  const fetched = await Promise.all(
    candidates.map(async (candidate) => ({ candidate, fragment: await source.get(candidate.ref) })),
  );

  const resolved: ResolvedCandidate[] = [];
  const dropped: TraceDrop[] = [];
  for (const { candidate, fragment } of fetched) {
    if (fragment === undefined) {
      dropped.push({ ref: candidate.ref, reason: 'no content for ref' });
    } else if (kinds !== undefined && !kinds.has(fragment.kind)) {
      dropped.push({ ref: candidate.ref, reason: `filtered out kind '${fragment.kind}'` });
    } else {
      resolved.push({ candidate, fragment });
    }
  }
  return { resolved, dropped };
}
