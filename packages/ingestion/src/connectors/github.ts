import type { DocumentMetadata, RawDocument, SourceEntry } from '../domain.js';
import type { Connector } from '../ports/connector.js';
import { contentHashOf } from '../hash.js';
import type {
  GitHubClient,
  GitHubComment,
  GitHubIssue,
  GitHubPullRequest,
} from './github-client.js';

/** Which item kinds the connector ingests (default: both issues and pull requests). */
export interface GitHubIncludeOptions {
  readonly issues?: boolean;
  readonly pullRequests?: boolean;
}

export interface GitHubConnectorOptions {
  /**
   * The (injectable) GitHub API surface — a real REST client in production, a fake in tests. It
   * already encodes the target owner/repo, so the connector needs nothing more to reach the source.
   */
  readonly client: GitHubClient;
  /** Restrict which item kinds are ingested. */
  readonly include?: GitHubIncludeOptions;
}

/** Provenance recorded on every ingested issue/PR document (non-sensitive, JSON-safe). */
interface GitHubDocumentProvenance {
  readonly number: number;
  readonly kind: 'issue' | 'pull_request';
  readonly url: string;
  readonly author: string | null;
  readonly state: 'open' | 'closed';
  readonly labels: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Present for pull requests only: whether it was merged. */
  readonly merged?: boolean;
  readonly mergedAt?: string | null;
}

const PATH_PATTERN = /^(pr|issue)\/(\d+)$/;

function isPullRequest(issue: GitHubIssue): boolean {
  return issue.pull_request !== undefined;
}

function pathFor(issue: GitHubIssue): string {
  return `${isPullRequest(issue) ? 'pr' : 'issue'}/${issue.number}`;
}

/** Sorted label names — a stable projection for both hashing and provenance. */
function labelNames(issue: GitHubIssue): readonly string[] {
  return issue.labels.map((label) => label.name).sort();
}

/**
 * Content hash over an item's **mutable** fields only (title/body/state/labels/updatedAt). Computed
 * identically by `list` and `resolve` so the connector satisfies the conformance contract, and
 * cheaply from a `list` call without fetching comments — GitHub bumps `updated_at` when a comment is
 * added or the item is edited, so this hash still changes on any meaningful update (incremental, FR-8).
 */
function entryHash(issue: GitHubIssue): string {
  const canonical = JSON.stringify({
    number: issue.number,
    pullRequest: isPullRequest(issue),
    title: issue.title,
    body: issue.body ?? '',
    state: issue.state,
    updatedAt: issue.updated_at,
    labels: labelNames(issue),
  });
  return contentHashOf(new TextEncoder().encode(canonical));
}

/** Render one comment into the document body. */
function renderComment(comment: GitHubComment): string {
  const author = comment.user?.login ?? 'unknown';
  return `### @${author} (${comment.created_at})\n\n${comment.body ?? ''}`;
}

/** Render an issue/PR (plus its comments) into deterministic, human-readable text. */
function renderDocument(
  issue: GitHubIssue,
  comments: readonly GitHubComment[],
  provenance: GitHubDocumentProvenance,
): string {
  const stateLine = provenance.merged === true ? `${issue.state} (merged)` : issue.state;
  const header = [
    `# ${issue.title}`,
    '',
    `- number: #${issue.number}`,
    `- type: ${provenance.kind === 'pull_request' ? 'pull request' : 'issue'}`,
    `- state: ${stateLine}`,
    `- author: ${provenance.author ?? 'unknown'}`,
    `- labels: ${provenance.labels.length > 0 ? provenance.labels.join(', ') : '(none)'}`,
    `- url: ${provenance.url}`,
  ].join('\n');

  const body = issue.body ?? '';
  const commentsSection =
    comments.length > 0
      ? `\n\n## Comments (${comments.length})\n\n${comments.map(renderComment).join('\n\n')}`
      : '';

  return `${header}\n\n${body}${commentsSection}\n`;
}

/**
 * First-party GitHub {@link Connector} (FR-4): ingests a repository's **issues and pull requests**
 * (with comments) through the same port the filesystem/git connectors use, so the incremental,
 * idempotent, secret-redacted pipeline (F-006) processes them unchanged. Each item becomes a document
 * at a stable synthetic path (`issue/{n}` or `pr/{n}`) carrying GitHub provenance metadata.
 *
 * Network access is entirely mediated by the injected {@link GitHubClient}; it only reaches GitHub
 * when a source is explicitly configured with a real client (NFR-3 — local mode makes no calls unless
 * enabled). See ADR-0024.
 */
export function createGitHubConnector(options: GitHubConnectorOptions): Connector {
  const { client } = options;
  const includeIssues = options.include?.issues ?? true;
  const includePullRequests = options.include?.pullRequests ?? true;

  function isIncluded(issue: GitHubIssue): boolean {
    return isPullRequest(issue) ? includePullRequests : includeIssues;
  }

  async function provenanceFor(issue: GitHubIssue): Promise<GitHubDocumentProvenance> {
    const base: GitHubDocumentProvenance = {
      number: issue.number,
      kind: isPullRequest(issue) ? 'pull_request' : 'issue',
      url: issue.html_url,
      author: issue.user?.login ?? null,
      state: issue.state,
      labels: labelNames(issue),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    };
    if (!isPullRequest(issue)) return base;
    const pr: GitHubPullRequest | undefined = await client.getPullRequest(issue.number);
    return { ...base, merged: pr?.merged ?? false, mergedAt: pr?.merged_at ?? null };
  }

  return {
    kind: 'github',

    async list() {
      const issues = await client.listIssues();
      return issues
        .filter(isIncluded)
        .map((issue): SourceEntry => ({ path: pathFor(issue), contentHash: entryHash(issue) }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },

    async resolve(path): Promise<RawDocument | undefined> {
      const match = PATH_PATTERN.exec(path);
      if (match === null) return undefined;
      const wantPullRequest = match[1] === 'pr';
      const number = Number(match[2]);

      const issue = await client.getIssue(number);
      // Not found, filtered out, or the path's kind no longer matches the item — treat as removed.
      if (issue === undefined || !isIncluded(issue) || isPullRequest(issue) !== wantPullRequest) {
        return undefined;
      }

      const [comments, provenance] = await Promise.all([
        client.listIssueComments(number),
        provenanceFor(issue),
      ]);
      const text = renderDocument(issue, comments, provenance);
      const metadata: DocumentMetadata = { connector: 'github', github: provenance };
      return {
        path,
        bytes: new TextEncoder().encode(text),
        contentHash: entryHash(issue),
        metadata,
      };
    },
  };
}
