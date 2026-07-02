import { InternalError, UnauthorizedError } from '@tessera/core';
import { describe, expect, it } from 'vitest';
import { createRestGitHubClient } from './github-client';

/** A `fetch` stand-in returning a fixed status/body, recording the headers each call received. */
function stubFetch(
  handler: (url: string) => { status?: number; body?: unknown; headers?: Record<string, string> },
): { fetchImpl: typeof fetch; calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const { status = 200, body = [], headers } = handler(url);
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('createRestGitHubClient', () => {
  it('paginates to completion and sends auth + version headers', async () => {
    const { fetchImpl, calls } = stubFetch((url) => {
      const page = new URL(url).searchParams.get('page');
      // perPage is 2: a full first page then a short page ends pagination.
      return { body: page === '1' ? [{ number: 1 }, { number: 2 }] : [{ number: 3 }] };
    });
    const client = createRestGitHubClient({
      owner: 'acme',
      repo: 'widgets',
      token: 'secret-token',
      perPage: 2,
      fetchImpl,
    });

    const issues = await client.listIssues();

    expect(issues.map((issue) => issue.number)).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain('/repos/acme/widgets/issues');
    expect(calls[0]?.headers['authorization']).toBe('Bearer secret-token');
    expect(calls[0]?.headers['x-github-api-version']).toBe('2022-11-28');
  });

  it('omits the authorization header when no token is given', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ body: [] }));

    await createRestGitHubClient({ owner: 'a', repo: 'b', fetchImpl }).listIssues();

    expect(calls[0]?.headers['authorization']).toBeUndefined();
  });

  it('returns undefined for a missing issue or pull request (404)', async () => {
    const { fetchImpl } = stubFetch(() => ({ status: 404, body: {} }));
    const client = createRestGitHubClient({ owner: 'a', repo: 'b', fetchImpl });

    expect(await client.getIssue(999)).toBeUndefined();
    expect(await client.getPullRequest(999)).toBeUndefined();
  });

  it('maps auth, rate-limit, and server failures to typed errors', async () => {
    const clientFor = (status: number, headers?: Record<string, string>) =>
      createRestGitHubClient({
        owner: 'a',
        repo: 'b',
        fetchImpl: stubFetch(() => ({ status, body: {}, headers })).fetchImpl,
      });

    await expect(clientFor(401).listIssues()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(clientFor(403, { 'x-ratelimit-remaining': '0' }).listIssues()).rejects.toThrow(
      /rate limit/i,
    );
    await expect(clientFor(500).listIssues()).rejects.toBeInstanceOf(InternalError);
  });
});
