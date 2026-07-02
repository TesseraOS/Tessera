import { describe, expect, it } from 'vitest';
import { createGitHubConnector } from '../../src/connectors/github';
import { createRestGitHubClient } from '../../src/connectors/github-client';
import { runConnectorConformance } from '../conformance/connector.conformance';
import {
  createFakeGitHubClient,
  makeIssue,
  makePullRequest,
  type FakeRepo,
} from '../support/fake-github-client';

const repo: FakeRepo = {
  issues: [
    makeIssue({ number: 1, title: 'Bug: crash on start', body: 'repro steps', state: 'closed' }),
    makePullRequest({ number: 2, title: 'Add feature', body: 'implementation' }),
  ],
  comments: {
    1: [
      { id: 10, user: { login: 'reporter' }, body: 'me too', created_at: '2026-01-03T00:00:00Z' },
    ],
  },
  pulls: { 2: { number: 2, merged: true, merged_at: '2026-01-04T00:00:00Z' } },
};

runConnectorConformance('github', () =>
  Promise.resolve({
    connector: createGitHubConnector({ client: createFakeGitHubClient(repo) }),
    expectedPaths: ['issue/1', 'pr/2'],
    missingPath: 'issue/999',
  }),
);

describe('github connector', () => {
  it('resolves a pull request with rendered body, comments, and merge provenance', async () => {
    const connector = createGitHubConnector({ client: createFakeGitHubClient(repo) });

    const raw = await connector.resolve('pr/2');
    expect(raw).toBeDefined();

    const metadata = raw?.metadata as Record<string, unknown>;
    const provenance = metadata['github'] as Record<string, unknown>;
    expect(metadata['connector']).toBe('github');
    expect(provenance['kind']).toBe('pull_request');
    expect(provenance['merged']).toBe(true);
    expect(raw?.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const text = new TextDecoder().decode(raw?.bytes ?? new Uint8Array());
    expect(text).toContain('# Add feature');
    expect(text).toContain('(merged)');
  });

  it('renders issue comments into the document body', async () => {
    const connector = createGitHubConnector({ client: createFakeGitHubClient(repo) });

    const raw = await connector.resolve('issue/1');
    const text = new TextDecoder().decode(raw?.bytes ?? new Uint8Array());

    expect(text).toContain('## Comments (1)');
    expect(text).toContain('@reporter');
  });

  it('changes the content hash when an item is edited (incremental)', async () => {
    const before = createGitHubConnector({
      client: createFakeGitHubClient({
        issues: [makeIssue({ number: 1, body: 'v1', updated_at: 't1' })],
      }),
    });
    const after = createGitHubConnector({
      client: createFakeGitHubClient({
        issues: [makeIssue({ number: 1, body: 'v2', updated_at: 't2' })],
      }),
    });

    const [entryBefore] = await before.list();
    const [entryAfter] = await after.list();
    expect(entryBefore?.contentHash).not.toBe(entryAfter?.contentHash);
  });

  it('honors the include filter (issues only)', async () => {
    const connector = createGitHubConnector({
      client: createFakeGitHubClient(repo),
      include: { pullRequests: false },
    });

    const paths = (await connector.list()).map((entry) => entry.path);
    expect(paths).toContain('issue/1');
    expect(paths).not.toContain('pr/2');
    expect(await connector.resolve('pr/2')).toBeUndefined();
  });
});

// Opt-in smoke test against the real GitHub API (like the transformers/ollama guards, F-005).
const live = process.env['TESSERA_TEST_GITHUB'] === '1';
describe.skipIf(!live)('github connector (live)', () => {
  it('lists issues/PRs from a real repository', async () => {
    const token = process.env['GITHUB_TOKEN'];
    const client = createRestGitHubClient({
      owner: process.env['GITHUB_TEST_OWNER'] ?? 'octocat',
      repo: process.env['GITHUB_TEST_REPO'] ?? 'Hello-World',
      ...(token !== undefined ? { token } : {}),
    });

    const entries = await createGitHubConnector({ client }).list();
    expect(entries.length).toBeGreaterThan(0);
  }, 30_000);
});
