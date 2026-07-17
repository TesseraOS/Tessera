import type { WorkspaceStats } from '@/lib/api/client';
import type { ContextPackage } from '@/lib/api/types';

/**
 * Explain an empty Context Package (F-062; FR-44).
 *
 * **The problem this exists to fix.** An empty compile renders "Budget adherence 100% · Provenance
 * coverage 100% · Redundancy 0% · 0 fragments" — three full progress bars announcing success. None
 * of those numbers is *false*: the package did not exceed budget, 100% of zero fragments carry
 * provenance, zero of zero pairs are duplicates. The lie is in presenting a vacuous truth as an
 * achievement. So this does not correct the arithmetic — it replaces the celebration with a reason.
 *
 * **It only says what the data proves.** The compilation trace is a funnel with integer counts per
 * stage, so the first stage to reach zero is a fact, not an inference. Where the trace genuinely
 * cannot distinguish two causes (an empty corpus from a query that matched nothing), the workspace
 * stats settle it — and where neither can, the copy stays generic rather than guessing. A diagnosis
 * the data cannot support is worse than no diagnosis, because the user will act on it.
 *
 * Pure: no components, no network. The whole matrix unit-tests directly.
 */

/** What the Inspector should tell the user, and where to send them. */
export interface EmptyPackageDiagnosis {
  /** Machine-readable cause, for tests and for choosing an action. */
  readonly cause:
    | 'no-sources'
    | 'nothing-indexed'
    | 'no-match'
    | 'filters-excluded-everything'
    | 'nothing-fit-budget'
    | 'unknown';
  readonly title: string;
  readonly description: string;
  /** The single most useful next step, or `undefined` when we genuinely cannot recommend one. */
  readonly action?: { readonly kind: 'sources' | 'clear-filters' | 'raise-budget' };
}

export interface DiagnoseOptions {
  /**
   * The workspace summary, when it loaded. Progressive enhancement ONLY: the diagnosis is correct
   * and complete without it. A caller whose token lacks `stats:read` gets a 403, and that must
   * degrade the copy, never block or crash the Inspector.
   */
  readonly stats?: WorkspaceStats | undefined;
  /** Whether the compile request carried kind filters — the UI knows what it sent. */
  readonly filtersApplied?: boolean;
}

/** The first stage whose output reached zero — the point in the funnel where everything was lost. */
function firstEmptyStage(pkg: ContextPackage): string | undefined {
  return pkg.trace.stages.find((stage) => stage.outputCount === 0)?.stage;
}

function reasonFrom(pkg: ContextPackage, stage: string): string | undefined {
  return pkg.trace.stages.find((s) => s.stage === stage)?.dropped[0]?.reason;
}

/**
 * Diagnose an empty package. Returns `undefined` when the package has fragments — there is nothing
 * to explain, and the scores should render normally.
 */
export function diagnoseEmptyPackage(
  pkg: ContextPackage,
  options: DiagnoseOptions = {},
): EmptyPackageDiagnosis | undefined {
  if (pkg.scores.fragmentCount > 0) return undefined;

  const stage = firstEmptyStage(pkg);

  // Nothing survived resolution, and the UI knows whether IT applied a filter — no reason-string
  // parsing needed to name the most likely suspect.
  if (stage === 'resolve' && options.filtersApplied === true) {
    return {
      cause: 'filters-excluded-everything',
      title: 'Your kind filters excluded every match',
      description:
        'Retrieval found candidates, but the kind filters dropped all of them. Filters narrow what was already retrieved — they do not fetch more of the chosen kind.',
      action: { kind: 'clear-filters' },
    };
  }

  // Fragments existed and none fit. The compiler already wrote a precise reason; use it.
  if (stage === 'compress') {
    const reason = reasonFrom(pkg, 'compress');
    return {
      cause: 'nothing-fit-budget',
      title: 'Nothing fit the token budget',
      description:
        reason === undefined
          ? 'Matches were found, but none fit within the requested budget.'
          : `Matches were found, but none fit within the requested budget — the first was dropped because it ${reason}.`,
      action: { kind: 'raise-budget' },
    };
  }

  if (stage === 'retrieve' || stage === 'plan') {
    // The trace proves retrieval returned nothing. It CANNOT distinguish "no corpus" from "no
    // match" — that is what the workspace summary is for.
    if (options.stats !== undefined) {
      if (options.stats.sources === 0) {
        return {
          cause: 'no-sources',
          title: 'No sources are connected',
          description:
            'Tessera has nothing to compile from yet. Connect a filesystem path or a Git repository, and scan it.',
          action: { kind: 'sources' },
        };
      }
      if (options.stats.documents === 0) {
        return {
          cause: 'nothing-indexed',
          title: 'Nothing is indexed yet',
          description:
            'Your sources are registered but no documents have been indexed. Run a scan, then compile again.',
          action: { kind: 'sources' },
        };
      }
      const count = options.stats.documents.toLocaleString();
      return {
        cause: 'no-match',
        title: 'Retrieval matched nothing for this task',
        description:
          // "indexed for your sources" is what the number MEANS (F-060 SL-6: it is counted via the
          // tenant's source registry + manifest). "Your corpus contains" would be a claim the stat
          // does not support under multi-tenant, where F-071 puts the rows elsewhere.
          `${count} document${options.stats.documents === 1 ? '' : 's'} are indexed for your sources, but none matched this task. Try naming a file, symbol, or concept from the code.`,
      };
    }

    return {
      cause: 'no-match',
      title: 'Retrieval matched nothing for this task',
      description:
        'No candidates were found for this task. Check that a source is connected and scanned, then try naming a file, symbol, or concept from the code.',
      action: { kind: 'sources' },
    };
  }

  // A stage we do not recognise reached zero — most likely because a stage was renamed. Stage names
  // are string literals on the wire, not an exported enum, so this is a soft contract: degrade to
  // something honest and point at the trace, rather than mis-diagnose or crash.
  return {
    cause: 'unknown',
    title: 'This compile produced no fragments',
    description:
      'Retrieval ran but nothing reached the package. The compilation trace below shows which stage dropped everything.',
  };
}
