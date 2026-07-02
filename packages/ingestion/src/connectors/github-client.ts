import { ForbiddenError, InternalError, NotFoundError, UnauthorizedError } from '@tessera/core';

/** A GitHub account reference (the fields the connector uses). */
export interface GitHubUser {
  readonly login: string;
}

/** A label on an issue or pull request. */
export interface GitHubLabel {
  readonly name: string;
}

/**
 * An issue as returned by the GitHub REST `issues` endpoint. Pull requests are also returned there
 * and are distinguished by the presence of {@link GitHubIssue.pull_request}.
 */
export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly state: 'open' | 'closed';
  readonly user: GitHubUser | null;
  readonly labels: readonly GitHubLabel[];
  readonly comments: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly html_url: string;
  /** Present (a marker object) only when this "issue" is actually a pull request. */
  readonly pull_request?: { readonly html_url: string };
}

/** A comment on an issue or pull request. */
export interface GitHubComment {
  readonly id: number;
  readonly user: GitHubUser | null;
  readonly body: string | null;
  readonly created_at: string;
}

/** Pull-request-specific fields not present on the shared issues endpoint (merge status). */
export interface GitHubPullRequest {
  readonly number: number;
  readonly merged: boolean;
  readonly merged_at: string | null;
}

/**
 * The narrow GitHub API surface the {@link import('./github.js')} connector depends on. Injecting
 * this (rather than reaching for `fetch` directly) keeps the connector deterministic and lets tests
 * drive it from an in-memory fake with **zero network** (mirrors the fake-embeddings pattern, F-005).
 */
export interface GitHubClient {
  /** Every issue **and** pull request in the repo, deterministically ordered (created ascending). */
  listIssues(): Promise<readonly GitHubIssue[]>;
  /** One issue/PR by number, or `undefined` if it does not exist. */
  getIssue(number: number): Promise<GitHubIssue | undefined>;
  /** Comments on an issue/PR, oldest first. */
  listIssueComments(number: number): Promise<readonly GitHubComment[]>;
  /** Merge status for a pull request by number, or `undefined` if it does not exist. */
  getPullRequest(number: number): Promise<GitHubPullRequest | undefined>;
}

export interface RestGitHubClientOptions {
  readonly owner: string;
  readonly repo: string;
  /**
   * A GitHub token (fine-grained or classic). Optional for public repos, but the anonymous rate
   * limit is low — production use should supply one via the SecretsProvider (F-015).
   */
  readonly token?: string;
  /** API base URL (default `https://api.github.com`; set for GitHub Enterprise). */
  readonly baseUrl?: string;
  /** `fetch` implementation, injectable for tests (default: the global `fetch`, Node ≥ 18). */
  readonly fetchImpl?: typeof fetch;
  /** Page size for list calls (default 100, GitHub's max). */
  readonly perPage?: number;
}

const DEFAULT_BASE_URL = 'https://api.github.com';
const DEFAULT_PER_PAGE = 100;
const GITHUB_API_VERSION = '2022-11-28';
/** Safety cap so a misbehaving API can never spin pagination forever. */
const MAX_PAGES = 1000;

/** Map a non-OK GitHub response to a typed domain error (never echoing the token). */
function errorFor(status: number, url: string, remaining: string | null): Error {
  const details = { status, url } as const;
  if (status === 401) return new UnauthorizedError('GitHub authentication failed', { details });
  if (status === 403) {
    const message = remaining === '0' ? 'GitHub rate limit exceeded' : 'GitHub request forbidden';
    return new ForbiddenError(message, { details: { ...details, rateLimitRemaining: remaining } });
  }
  if (status === 404) return new NotFoundError('GitHub resource not found', { details });
  return new InternalError('GitHub request failed', { details });
}

/**
 * A {@link GitHubClient} over the real GitHub REST API using the platform `fetch` — no Octokit, so
 * `@tessera/ingestion` stays dependency-free (consistent with the git-via-CLI decision, ADR-0015;
 * ratified for GitHub in ADR-0024). All list calls paginate to completion in a deterministic order.
 */
export function createRestGitHubClient(options: RestGitHubClientOptions): GitHubClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const doFetch = options.fetchImpl ?? fetch;
  const repoPath = `/repos/${options.owner}/${options.repo}`;

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': GITHUB_API_VERSION,
    'user-agent': 'tessera-ingestion',
  };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;

  /** Fetch one URL and parse JSON, mapping errors; `null` for a 404 on a single-resource GET. */
  async function get<T>(path: string, allowMissing: boolean): Promise<T | null> {
    const url = `${baseUrl}${path}`;
    const response = await doFetch(url, { headers });
    if (!response.ok) {
      if (allowMissing && response.status === 404) return null;
      throw errorFor(response.status, url, response.headers.get('x-ratelimit-remaining'));
    }
    return (await response.json()) as T;
  }

  /** Page through a list endpoint until a short page signals the end. */
  async function paginate<T>(path: string, query: string): Promise<readonly T[]> {
    const items: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const sep = query.length > 0 ? '&' : '';
      const pageItems = await get<readonly T[]>(
        `${path}?${query}${sep}per_page=${perPage}&page=${page}`,
        false,
      );
      if (pageItems === null || pageItems.length === 0) break;
      items.push(...pageItems);
      if (pageItems.length < perPage) break;
    }
    return items;
  }

  return {
    listIssues() {
      // `state=all` includes closed; sorting keeps the scan order (and thus diffs) deterministic.
      return paginate<GitHubIssue>(`${repoPath}/issues`, 'state=all&sort=created&direction=asc');
    },
    async getIssue(number) {
      return (await get<GitHubIssue>(`${repoPath}/issues/${number}`, true)) ?? undefined;
    },
    listIssueComments(number) {
      return paginate<GitHubComment>(`${repoPath}/issues/${number}/comments`, '');
    },
    async getPullRequest(number) {
      return (await get<GitHubPullRequest>(`${repoPath}/pulls/${number}`, true)) ?? undefined;
    },
  };
}
