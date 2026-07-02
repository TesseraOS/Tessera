import type {
  GitHubClient,
  GitHubComment,
  GitHubIssue,
  GitHubPullRequest,
} from '../../src/connectors/github-client';

/** In-memory repo the fake client serves. */
export interface FakeRepo {
  readonly issues: readonly GitHubIssue[];
  readonly comments?: Readonly<Record<number, readonly GitHubComment[]>>;
  readonly pulls?: Readonly<Record<number, GitHubPullRequest>>;
}

/** Build a {@link GitHubIssue} with sensible defaults; override only what a test cares about. */
export function makeIssue(overrides: Partial<GitHubIssue> & { number: number }): GitHubIssue {
  const { number } = overrides;
  return {
    number,
    title: overrides.title ?? `Item ${number}`,
    body: overrides.body ?? `body of ${number}`,
    state: overrides.state ?? 'open',
    user: overrides.user ?? { login: 'octocat' },
    labels: overrides.labels ?? [],
    comments: overrides.comments ?? 0,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-02T00:00:00Z',
    html_url: overrides.html_url ?? `https://github.com/acme/widgets/issues/${number}`,
    ...(overrides.pull_request !== undefined ? { pull_request: overrides.pull_request } : {}),
  };
}

/** Build a pull-request-shaped {@link GitHubIssue} (has the `pull_request` marker + a pull URL). */
export function makePullRequest(overrides: Partial<GitHubIssue> & { number: number }): GitHubIssue {
  const { number } = overrides;
  const htmlUrl = overrides.html_url ?? `https://github.com/acme/widgets/pull/${number}`;
  return makeIssue({
    ...overrides,
    html_url: htmlUrl,
    pull_request: overrides.pull_request ?? { html_url: htmlUrl },
  });
}

/** A deterministic, offline {@link GitHubClient} over an in-memory repo (mirrors fake-embeddings, F-005). */
export function createFakeGitHubClient(repo: FakeRepo): GitHubClient {
  return {
    listIssues() {
      return Promise.resolve(repo.issues);
    },
    getIssue(number) {
      return Promise.resolve(repo.issues.find((issue) => issue.number === number));
    },
    listIssueComments(number) {
      return Promise.resolve(repo.comments?.[number] ?? []);
    },
    getPullRequest(number) {
      return Promise.resolve(repo.pulls?.[number]);
    },
  };
}
