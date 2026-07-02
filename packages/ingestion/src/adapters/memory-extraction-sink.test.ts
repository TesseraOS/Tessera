import { describe, expect, it } from 'vitest';
import type { ProcessedDocument } from '../domain';
import type { MemoryExtractor } from '../extraction/candidate';
import { createFakeMemoryService } from '../../tests/support/fake-memory-service';
import { createInMemoryDocumentSink } from './in-memory-sink';
import { createMemoryExtractionSink } from './memory-extraction-sink';
import { teeSink } from './tee-sink';

function makeDoc(text: string): ProcessedDocument {
  return {
    id: 'doc' as ProcessedDocument['id'],
    source: { id: 'src' as ProcessedDocument['source']['id'], kind: 'filesystem', label: 'repo' },
    path: 'p',
    kind: 'text',
    contentHash: 'hash',
    text,
    metadata: {},
    redactions: [],
  };
}

/** A one-candidate extractor with a fixed `source`, keyed off the document text as the body. */
const sourcedExtractor: MemoryExtractor = (document) => [
  {
    kind: 'decision',
    title: 'T',
    body: document.text,
    scope: 'global',
    metadata: { source: 'x:1' },
  },
];

describe('createMemoryExtractionSink', () => {
  it('captures on first ingest, skips an identical re-ingest, and supersedes on change', async () => {
    const memory = createFakeMemoryService();
    const sink = createMemoryExtractionSink({ memory, extractors: [sourcedExtractor] });

    await sink.upsert(makeDoc('body v1'));
    expect(memory.current()).toHaveLength(1);
    expect(memory.current()[0]?.body).toBe('body v1');

    // Identical content → no new memory and no new version (idempotent).
    await sink.upsert(makeDoc('body v1'));
    expect(memory.current()).toHaveLength(1);
    expect(memory.allVersions()).toHaveLength(1);

    // Changed content → supersede: one current memory, now at version 2.
    await sink.upsert(makeDoc('body v2'));
    expect(memory.current()).toHaveLength(1);
    expect(memory.current()[0]?.body).toBe('body v2');
    expect(memory.current()[0]?.version).toBe(2);
    expect(memory.allVersions()).toHaveLength(2);
  });

  it('captures unconditionally when a candidate has no source', async () => {
    const anonymous: MemoryExtractor = (document) => [
      { kind: 'lesson', title: 'A', body: document.text },
    ];
    const memory = createFakeMemoryService();
    const sink = createMemoryExtractionSink({ memory, extractors: [anonymous] });

    await sink.upsert(makeDoc('same'));
    await sink.upsert(makeDoc('same'));

    expect(memory.current()).toHaveLength(2);
  });

  it('is a no-op on remove (memories are versioned, never hard-deleted)', async () => {
    const memory = createFakeMemoryService();
    const sink = createMemoryExtractionSink({ memory, extractors: [sourcedExtractor] });
    await sink.upsert(makeDoc('body'));

    await sink.remove({ sourceId: 'src' as ProcessedDocument['source']['id'], path: 'p' });

    expect(memory.current()).toHaveLength(1);
  });
});

describe('teeSink', () => {
  it('fans upsert out to a persistence sink and the extraction sink', async () => {
    const memory = createFakeMemoryService();
    const persist = createInMemoryDocumentSink();
    const sink = teeSink(
      persist,
      createMemoryExtractionSink({ memory, extractors: [sourcedExtractor] }),
    );

    await sink.upsert(makeDoc('content'));

    expect(persist.size).toBe(1);
    expect(memory.current()).toHaveLength(1);
  });
});
