import { describe, expect, it } from 'vitest';
import type { DocumentMetadata, ProcessedDocument } from '../domain';
import { githubMemoryExtractor } from './github-extractor';

function makeDoc(github: Record<string, unknown> | undefined, text: string): ProcessedDocument {
  const metadata: DocumentMetadata = github === undefined ? {} : { connector: 'github', github };
  return {
    id: 'doc' as ProcessedDocument['id'],
    source: {
      id: 'src' as ProcessedDocument['source']['id'],
      kind: 'github',
      label: 'acme/widgets',
    },
    path: 'pr/12',
    kind: 'text',
    contentHash: 'hash',
    text,
    metadata,
    redactions: [],
  };
}

const mergedPr = {
  number: 12,
  kind: 'pull_request',
  url: 'https://github.com/acme/widgets/pull/12',
  author: 'alice',
  state: 'closed',
  merged: true,
};
const closedIssue = {
  number: 7,
  kind: 'issue',
  url: 'https://github.com/acme/widgets/issues/7',
  author: 'bob',
  state: 'closed',
  merged: false,
};

describe('githubMemoryExtractor', () => {
  it('turns a merged pull request into a decision memory', () => {
    const [memory] = githubMemoryExtractor(
      makeDoc(mergedPr, '# Add fetch client\n\nDetails here.'),
    );

    expect(memory?.kind).toBe('decision');
    expect(memory?.title).toBe('Add fetch client');
    expect(memory?.body).toContain('Details here.');
    expect(memory?.metadata?.source).toBe('github:acme/widgets#12');
    expect(memory?.metadata?.author).toBe('alice');
    expect(memory?.metadata?.tags).toContain('pull-request');
    expect(memory?.metadata?.links).toEqual(['https://github.com/acme/widgets/pull/12']);
  });

  it('turns a closed issue into a lesson memory', () => {
    const [memory] = githubMemoryExtractor(makeDoc(closedIssue, '# Crash on start\n\nfixed'));

    expect(memory?.kind).toBe('lesson');
    expect(memory?.metadata?.source).toBe('github:acme/widgets#7');
    expect(memory?.metadata?.tags).toContain('issue');
  });

  it('ignores open/unmerged items and documents without GitHub provenance', () => {
    const openPr = { ...mergedPr, state: 'open', merged: false };
    const openIssue = { ...closedIssue, state: 'open' };

    expect(githubMemoryExtractor(makeDoc(openPr, '# x'))).toEqual([]);
    expect(githubMemoryExtractor(makeDoc(openIssue, '# x'))).toEqual([]);
    expect(githubMemoryExtractor(makeDoc({}, '# x'))).toEqual([]);
    expect(githubMemoryExtractor(makeDoc(undefined, '# x'))).toEqual([]);
  });
});
