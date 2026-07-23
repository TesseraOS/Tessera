import { createEventBus, DEFAULT_PROJECT_ID, DEFAULT_TENANT_ID, newId } from '@tessera/core';
import { createInProcessQueue } from '@tessera/storage';
import { describe, expect, it } from 'vitest';
import type {
  ChangeEvent,
  IngestionEvents,
  IngestionScope,
  RawDocument,
  SourceDescriptor,
} from '../domain.js';
import type { Connector } from '../ports/connector.js';
import { createInMemoryManifest } from '../adapters/in-memory-manifest.js';
import { createInMemoryDocumentSink } from '../adapters/in-memory-sink.js';
import { createIngestionWorker, INGESTION_TOPIC } from './worker.js';

/**
 * The two guarantees F-071 rests on at the worker: it routes a scoped job to
 * `sink.forTenant().forProject()` so content lands only in the scanning scope, and it NEVER silently
 * defaults an unscoped job — the permanent anti-regression device.
 */

const source: SourceDescriptor = { id: newId<'Source'>(), kind: 'test', label: 'fixture' };

const connector: Connector = {
  kind: 'test',
  list: () => Promise.resolve([]),
  resolve: (path): Promise<RawDocument> =>
    Promise.resolve({
      path,
      bytes: new TextEncoder().encode('export const x = 1;\n'),
      contentHash: `hash-${path}`,
      metadata: {},
    }),
};

const addedEvent = (scope: IngestionScope, path = 'a.ts'): ChangeEvent => ({
  source,
  scope,
  path,
  changeKind: 'added',
  contentHash: `hash-${path}`,
});

describe('worker scope handling (F-071)', () => {
  it('routes an ingest to the job scope, leaving every other partition empty', async () => {
    const sink = createInMemoryDocumentSink();
    const queue = createInProcessQueue();
    createIngestionWorker({
      queue,
      connectors: [connector],
      sink,
      manifest: createInMemoryManifest(),
    });

    await queue.enqueue(INGESTION_TOPIC, addedEvent({ tenantId: 'acme', projectId: 'beta' }));
    await queue.shutdown();

    expect(sink.forTenant('acme').forProject('beta').size).toBe(1);
    expect(sink.forTenant('globex').size).toBe(0);
    expect(sink.forTenant('acme').size).toBe(0); // acme's DEFAULT project, not beta
    expect(sink.size).toBe(0); // the (default, default) base view
  });

  it('the default scope routes to the (default, default) base view', async () => {
    const sink = createInMemoryDocumentSink();
    const queue = createInProcessQueue();
    createIngestionWorker({
      queue,
      connectors: [connector],
      sink,
      manifest: createInMemoryManifest(),
    });

    await queue.enqueue(
      INGESTION_TOPIC,
      addedEvent({ tenantId: DEFAULT_TENANT_ID, projectId: DEFAULT_PROJECT_ID }),
    );
    await queue.shutdown();

    expect(sink.size).toBe(1);
  });

  it('rejects an unscoped job instead of defaulting it — nothing is indexed anywhere', async () => {
    const sink = createInMemoryDocumentSink();
    const queue = createInProcessQueue();
    const events = createEventBus<IngestionEvents>();
    let processed = 0;
    let ingested = 0;
    events.on('document.processed', () => {
      processed += 1;
    });
    events.on('document.ingested', () => {
      ingested += 1;
    });
    createIngestionWorker({
      queue,
      connectors: [connector],
      sink,
      manifest: createInMemoryManifest(),
      events,
    });

    // The shape a buggy producer — or a durable job enqueued before this feature — would deliver.
    const unscoped = { source, path: 'a.ts', changeKind: 'added', contentHash: 'h' } as ChangeEvent;
    await queue.enqueue(INGESTION_TOPIC, unscoped);
    await queue.shutdown();

    // `document.processed` fires in the worker's `finally` for every job, so the job WAS handled;
    // `document.ingested` fires only AFTER a successful upsert, so its absence proves `handle` threw
    // rather than writing. And the decisive assertion: nothing landed in any scope, least of all the
    // default one.
    expect(processed).toBe(1);
    expect(ingested).toBe(0);
    expect(sink.size).toBe(0);
    expect(sink.forTenant('acme').forProject('beta').size).toBe(0);
  });
});
