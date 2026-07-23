import { describe, expect, it } from 'vitest';
import { newId } from '@tessera/core';
import type { ProcessedDocument } from '../domain';
import { documentIdFor } from '../domain';
import type { DocumentSink } from '../ports/sink';
import { runDocumentSinkScopeConformance } from '../../tests/conformance/document-sink-scope.conformance';
import { createInMemoryDocumentSink, type InMemoryDocumentSink } from './in-memory-sink';
import { teeSink } from './tee-sink';

function makeDoc(): ProcessedDocument {
  const sourceId = newId<'Source'>();
  const path = `${newId<'Document'>()}.ts`;
  // The id is deterministic from (source, path) — the same rule `remove` uses to find it.
  return {
    id: documentIdFor(sourceId, path),
    source: { id: sourceId, kind: 'test', label: 'x' },
    path,
    kind: 'code',
    contentHash: 'h',
    text: 'x',
    metadata: {},
    redactions: [],
  };
}

describe('createInMemoryDocumentSink', () => {
  it('is idempotent on upsert and removes by ref within a scope', async () => {
    const sink = createInMemoryDocumentSink();
    const document = makeDoc();
    await sink.upsert(document);
    await sink.upsert(document); // same id → one record
    expect(sink.size).toBe(1);

    await sink.remove({ sourceId: document.source.id, path: document.path });
    expect(sink.size).toBe(0);
  });
});

// The base persistence sink must satisfy the scope-routing contract…
runDocumentSinkScopeConformance('in-memory sink', {
  makeSink: () => createInMemoryDocumentSink(),
  countIn: (sink, tenantId, projectId) =>
    Promise.resolve((sink as InMemoryDocumentSink).forTenant(tenantId).forProject(projectId).size),
});

// …and so must a tee over it, which proves the fan-out forwards the scope to its members.
const inners = new WeakMap<DocumentSink, InMemoryDocumentSink>();
runDocumentSinkScopeConformance('tee over an in-memory sink', {
  makeSink: () => {
    const inner = createInMemoryDocumentSink();
    const tee = teeSink(inner);
    inners.set(tee, inner);
    return tee;
  },
  countIn: (sink, tenantId, projectId) => {
    const inner = inners.get(sink);
    if (inner === undefined) throw new Error('fixture: no inner sink recorded');
    return Promise.resolve(inner.forTenant(tenantId).forProject(projectId).size);
  },
});
