import type { DocumentMetadata, ProcessedDocument } from '../domain.js';
import type { CandidateMemory, CandidateMemoryKind, MemoryExtractor } from './candidate.js';
import { firstHeading } from './text.js';

/** Confidence for a GitHub-derived memory (useful signal, but noisier than a curated ADR). */
const GITHUB_CONFIDENCE = 0.7;

/** The fields of the connector's `github` provenance the extractor relies on. */
interface GitHubProvenanceView {
  readonly number: number;
  readonly kind: 'issue' | 'pull_request';
  readonly url: string;
  readonly author: string | null;
  readonly state: 'open' | 'closed';
  readonly merged: boolean;
}

/** Safely read the connector's `github` provenance object off a document's metadata. */
function readProvenance(metadata: DocumentMetadata): GitHubProvenanceView | undefined {
  const value = metadata['github'];
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const number = record['number'];
  const kind = record['kind'];
  const url = record['url'];
  const state = record['state'];
  if (typeof number !== 'number') return undefined;
  if (kind !== 'issue' && kind !== 'pull_request') return undefined;
  if (typeof url !== 'string') return undefined;
  if (state !== 'open' && state !== 'closed') return undefined;
  return {
    number,
    kind,
    url,
    author: typeof record['author'] === 'string' ? record['author'] : null,
    state,
    merged: record['merged'] === true,
  };
}

/** Stable `github:owner/repo#number` id (idempotency key), parsed from the item URL. */
function sourceIdFor(view: GitHubProvenanceView): string {
  try {
    const segments = new URL(view.url).pathname.split('/').filter((part) => part.length > 0);
    const [owner, repo] = segments;
    if (owner !== undefined && repo !== undefined) return `github:${owner}/${repo}#${view.number}`;
  } catch {
    // Non-URL provenance — fall back to a number-only id below.
  }
  return `github:#${view.number}`;
}

/** The memory kind (if any) a settled GitHub item warrants; open/unmerged items produce nothing. */
function memoryKindFor(view: GitHubProvenanceView): CandidateMemoryKind | undefined {
  if (view.kind === 'pull_request' && view.merged) return 'decision';
  if (view.kind === 'issue' && view.state === 'closed') return 'lesson';
  return undefined;
}

/**
 * Extracts a memory from an ingested **GitHub issue or pull request** (FR-4 + FR-14). Conservative
 * by design: only **settled** items become memories — a merged PR is a `decision`, a closed issue is
 * a `lesson`; open/unmerged items produce nothing. Sourced as `github:owner/repo#n` for idempotent
 * re-ingest. The body is the (already redacted) rendered document, so no secrets are carried.
 */
export const githubMemoryExtractor: MemoryExtractor = (
  document: ProcessedDocument,
): readonly CandidateMemory[] => {
  const view = readProvenance(document.metadata);
  if (view === undefined) return [];
  const kind = memoryKindFor(view);
  if (kind === undefined) return [];

  const title =
    firstHeading(document.text) ??
    `${view.kind === 'pull_request' ? 'PR' : 'Issue'} #${view.number}`;
  const tags = ['github', view.kind === 'pull_request' ? 'pull-request' : 'issue'];

  return [
    {
      kind,
      title,
      body: document.text.trim(),
      scope: 'global',
      confidence: GITHUB_CONFIDENCE,
      metadata: {
        source: sourceIdFor(view),
        ...(view.author !== null ? { author: view.author } : {}),
        links: [view.url],
        tags,
      },
    },
  ];
};
