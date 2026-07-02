import { describe, expect, it } from 'vitest';
import type { ProcessedDocument } from '../domain';
import { adrMemoryExtractor } from './adr-extractor';

function makeDoc(path: string, text: string): ProcessedDocument {
  return {
    id: 'doc' as ProcessedDocument['id'],
    source: { id: 'src' as ProcessedDocument['source']['id'], kind: 'filesystem', label: 'repo' },
    path,
    kind: 'markdown',
    contentHash: 'hash',
    text,
    metadata: {},
    redactions: [],
  };
}

const ADR = [
  '# ADR-0024: GitHub connector via REST fetch',
  '',
  '- **Status:** Accepted',
  '- **Date:** 2026-07-02',
  '',
  '## Context',
  '',
  'Some context.',
  '',
  '## Decision',
  '',
  'We will use native fetch.',
  '',
  '## Consequences',
  '',
  'Fine.',
].join('\n');

describe('adrMemoryExtractor', () => {
  it('extracts a decision memory from an ADR (title, Decision body, source, status tag)', () => {
    const [memory, ...rest] = adrMemoryExtractor(makeDoc('docs/adr/0024-github-connector.md', ADR));

    expect(rest).toHaveLength(0);
    expect(memory?.kind).toBe('decision');
    expect(memory?.title).toBe('ADR-0024: GitHub connector via REST fetch');
    expect(memory?.body).toBe('We will use native fetch.');
    expect(memory?.metadata?.source).toBe('adr:0024');
    expect(memory?.metadata?.links).toEqual(['docs/adr/0024-github-connector.md']);
    expect(memory?.metadata?.tags).toContain('adr');
    expect(memory?.metadata?.tags).toContain('status:accepted');
  });

  it('falls back to the whole document when there is no Decision section', () => {
    const noDecision =
      '# ADR-0030: Something\n\n- **Status:** Proposed\n\n## Context\n\nonly context here.';
    const [memory] = adrMemoryExtractor(makeDoc('docs/adr/0030-something.md', noDecision));

    expect(memory?.body).toContain('only context here.');
  });

  it('ignores the ADR template and non-ADR documents', () => {
    expect(adrMemoryExtractor(makeDoc('docs/adr/0000-template.md', ADR))).toEqual([]);
    expect(adrMemoryExtractor(makeDoc('README.md', '# Readme\n\ncontent'))).toEqual([]);
    expect(adrMemoryExtractor(makeDoc('src/foo.ts', 'export const x = 1;'))).toEqual([]);
  });
});
