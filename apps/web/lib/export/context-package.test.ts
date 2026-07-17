import { describe, expect, it } from 'vitest';
import {
  citationOf,
  exportFilename,
  fenceFor,
  fragmentToMarkdown,
  toJson,
  toMarkdown,
} from '@/lib/export/context-package';
import type { ContextFragment, ContextPackage } from '@/lib/api/types';

function fragment(over: Partial<ContextFragment> = {}): ContextFragment {
  return {
    ref: 'a'.repeat(64),
    text: 'export function postEntry() { return ledger.append(entry); }',
    kind: 'code',
    tokens: 312,
    score: 0.842,
    provenance: {
      retrievalScore: 0.842,
      signals: ['keyword', 'semantic'],
      source: { path: 'src/reporting/ledger.ts', sourceId: 's1' },
    },
    whyIncluded: 'High keyword + semantic match',
    ...over,
  };
}

function pkg(over: Partial<ContextPackage> = {}): ContextPackage {
  const fragments = over.sections?.[0]?.fragments ?? [fragment()];
  return {
    task: 'How does the ledger work?',
    budget: 2000,
    totalTokens: 312,
    sections: [{ title: 'code', fragments }],
    trace: { stages: [{ stage: 'retrieve', inputCount: 1, outputCount: 1, dropped: [] }] },
    scores: { fragmentCount: 1, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
    ...over,
  };
}

describe('citationOf', () => {
  it('cites an ingested file by its real path, not its content hash', () => {
    // "Citation-preserving" is meaningless if the citation is a sha256 — an agent cannot open it.
    expect(citationOf(fragment())).toBe('src/reporting/ledger.ts');
  });

  it('cites a memory by its title', () => {
    const memory = fragment({
      kind: 'memory',
      provenance: {
        retrievalScore: 0.6,
        signals: ['keyword'],
        source: { title: 'Ledger is append-only', lineageId: 'l1' },
      },
    });
    expect(citationOf(memory)).toBe('Ledger is append-only');
  });

  it('falls back to the ref when the fragment carries no source metadata', () => {
    const bare = fragment({ provenance: { retrievalScore: 0.5, signals: [] } });
    expect(citationOf(bare)).toBe('a'.repeat(64));
  });
});

describe('fenceFor', () => {
  it('uses a normal fence for ordinary text', () => {
    expect(fenceFor('const a = 1;')).toBe('```');
  });

  it('outgrows any backtick run inside the text', () => {
    // Fragment text is ingested repository content and `markdown` is a first-class document kind,
    // so bodies WILL contain fences. A hardcoded ``` breaks the document on the first real .md file.
    expect(fenceFor('a ``` b')).toBe('````');
    expect(fenceFor('a ```` b')).toBe('`````');
    expect(fenceFor('inline `code` only')).toBe('```');
  });
});

describe('fragmentToMarkdown', () => {
  it('carries the citation, why-included, provenance and the ref', () => {
    const md = fragmentToMarkdown(fragment());

    expect(md).toContain('### src/reporting/ledger.ts');
    expect(md).toContain('**Why included:** High keyword + semantic match');
    expect(md).toContain('**Signals:** keyword, semantic');
    expect(md).toContain('**Retrieval score:** 0.842');
    // The raw ref survives alongside the readable citation — nothing is lost by naming it well.
    expect(md).toContain(`**Ref:** \`${'a'.repeat(64)}\``);
    expect(md).toContain('export function postEntry()');
  });

  it('copies whyIncluded VERBATIM, including the compression note', () => {
    // whyIncluded is FR-32's own artifact and already self-documents compression. Paraphrasing it
    // would quietly drop the fact that the reader is looking at an excerpt.
    const compressed = fragment({
      whyIncluded: 'High semantic match; compressed to fit budget (900→312 tokens)',
    });
    expect(fragmentToMarkdown(compressed)).toContain('compressed to fit budget (900→312 tokens)');
  });

  it('fences a body that itself contains a fence, so the output stays one code block', () => {
    const md = fragmentToMarkdown(
      fragment({
        kind: 'markdown',
        text: '# Readme\n\n```ts\nconst a = 1;\n```\n\nDone.',
        provenance: { retrievalScore: 0.5, signals: ['keyword'], source: { path: 'README.md' } },
      }),
    );

    // The outer fence must be longer than the inner one, or the block terminates early and the rest
    // of the document is misparsed.
    expect(md).toContain('````md');
    const opening = md.indexOf('````md');
    const closing = md.lastIndexOf('````');
    expect(closing).toBeGreaterThan(opening);
    // The inner fence survives intact inside the block.
    expect(md).toContain('```ts');
  });

  it('records expandedFrom when a fragment arrived via effect-expansion', () => {
    const expanded = fragment({
      provenance: {
        retrievalScore: 0.4,
        signals: ['graph'],
        source: { path: 'src/api/routes.ts' },
        expandedFrom: 'src/reporting/ledger.ts',
      },
    });
    expect(fragmentToMarkdown(expanded)).toContain('**Expanded from:** `src/reporting/ledger.ts`');
  });

  it('says "none" rather than nothing when a fragment has no signals', () => {
    const bare = fragment({ provenance: { retrievalScore: 0, signals: [] } });
    expect(fragmentToMarkdown(bare)).toContain('**Signals:** none');
  });
});

describe('toMarkdown', () => {
  it('renders the task, the totals, and a section per kind', () => {
    const md = toMarkdown(pkg());

    expect(md).toContain('# Context: How does the ledger work?');
    expect(md).toContain('1 fragment · 312 / 2,000 tokens');
    // The section heading IS the fragment kind — the assemble stage groups by kind. Not invented.
    expect(md).toContain('## code');
  });

  it('says an empty package is empty rather than emitting a truncated document', () => {
    const empty = toMarkdown(
      pkg({
        sections: [],
        totalTokens: 0,
        scores: { fragmentCount: 0, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
      }),
    );

    expect(empty).toContain('Retrieval matched nothing for this task');
    expect(empty).toContain('0 fragments');
    // Pasted into an agent, this must read as "nothing matched", never as a document that got cut off.
    expect(empty).not.toContain('## ');
  });

  it('pluralizes honestly', () => {
    expect(toMarkdown(pkg())).toContain('1 fragment ·');
    const two = pkg({
      sections: [{ title: 'code', fragments: [fragment(), fragment({ ref: 'b'.repeat(64) })] }],
      scores: { fragmentCount: 2, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
    });
    expect(toMarkdown(two)).toContain('2 fragments ·');
  });

  it('handles unicode task text and bodies', () => {
    const md = toMarkdown(
      pkg({
        task: '¿Cómo funciona el módulo de contabilidad?',
        sections: [{ title: 'code', fragments: [fragment({ text: 'const saldo = 1; // año' })] }],
      }),
    );
    expect(md).toContain('# Context: ¿Cómo funciona el módulo de contabilidad?');
    expect(md).toContain('const saldo = 1; // año');
  });
});

describe('toJson', () => {
  it('round-trips the package exactly, trace included', () => {
    const original = pkg();
    const parsed: unknown = JSON.parse(toJson(original));
    // The JSON export is the complete record — the bytes the API sent, not a projection of them.
    expect(parsed).toEqual(original);
  });
});

describe('exportFilename', () => {
  it('slugs the task', () => {
    expect(exportFilename(pkg(), 'md')).toBe('tessera-context-how-does-the-ledger-work.md');
  });

  it('survives a task with no slug-able characters', () => {
    expect(exportFilename(pkg({ task: '???' }), 'json')).toBe('tessera-context-package.json');
  });

  it('bounds the length', () => {
    const long = exportFilename(pkg({ task: 'word '.repeat(60) }), 'md');
    expect(long.length).toBeLessThan(80);
  });
});
