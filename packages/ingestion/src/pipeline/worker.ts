import { ValidationError, type EventBus } from '@tessera/core';
import type { Queue, QueueSubscription } from '@tessera/storage';
import type { ChangeEvent, IngestionEvents } from '../domain.js';
import type { Connector } from '../ports/connector.js';
import type { Processor } from '../ports/processor.js';
import { runPipeline } from '../ports/processor.js';
import type { DocumentSink } from '../ports/sink.js';
import type { IngestionManifest } from '../ports/manifest.js';
import { createNormalizeProcessor } from '../processors/normalize.js';
import { createRedactionProcessor } from '../processors/redact-processor.js';
import { decodeDocument } from './decode.js';

/** Default queue topic the coordinator publishes change events to and the worker consumes. */
export const INGESTION_TOPIC = 'ingestion.change';

export interface IngestionWorkerOptions {
  /** Queue the worker consumes change events from (the `Queue` port from `@tessera/storage`). */
  readonly queue: Queue;
  /** Connectors used to resolve a change event's content, keyed internally by `connector.kind`. */
  readonly connectors: readonly Connector[];
  /**
   * Optional per-**source** connector resolver, taking precedence over the `connectors` kind-map. The
   * runtime source service (F-038) supplies this so multiple sources of the same kind (e.g. two
   * filesystem roots) each resolve their own connector. Returning `undefined` falls back to the map.
   */
  readonly connectorFor?: (source: ChangeEvent['source']) => Connector | undefined;
  /** Where processed documents are persisted. */
  readonly sink: DocumentSink;
  /** The content-hash index advanced after each successful persist. */
  readonly manifest: IngestionManifest;
  /** Optional middle pipeline stages; `normalize` runs first and `redact` is always appended last. */
  readonly processors?: readonly Processor[];
  /** Queue topic to subscribe to (default {@link INGESTION_TOPIC}). */
  readonly topic?: string;
  /** Optional domain event bus to publish `document.ingested` / `document.removed` on. */
  readonly events?: EventBus<IngestionEvents>;
}

export interface IngestionWorker {
  /** The queue subscription; call `unsubscribe()` to stop the worker. */
  readonly subscription: QueueSubscription;
}

/**
 * Subscribe a worker that processes ingestion change events from the {@link Queue} (FR-6). For each
 * event it resolves content via the matching connector, runs the processor pipeline
 * (`normalize → … → redact`), and persists to the sink — but **only if the content hash is new**,
 * making processing incremental and idempotent (FR-8). Redaction is appended as the terminal,
 * non-bypassable stage so secrets are scrubbed before any persist (FR-9).
 */
export function createIngestionWorker(options: IngestionWorkerOptions): IngestionWorker {
  const { queue, sink, manifest, events } = options;
  const topic = options.topic ?? INGESTION_TOPIC;
  const connectorByKind = new Map(
    options.connectors.map((connector) => [connector.kind, connector]),
  );
  const pipeline: readonly Processor[] = [
    createNormalizeProcessor(),
    ...(options.processors ?? []),
    createRedactionProcessor(),
  ];

  async function forget(sourceId: ChangeEvent['source']['id'], path: string): Promise<void> {
    await sink.remove({ sourceId, path });
    await manifest.delete(sourceId, path);
    await events?.emit('document.removed', { sourceId, path });
  }

  async function handle(event: ChangeEvent): Promise<void> {
    const { source, path, changeKind } = event;
    if (changeKind === 'removed') {
      await forget(source.id, path);
      return;
    }

    const connector = options.connectorFor?.(source) ?? connectorByKind.get(source.kind);
    if (connector === undefined) {
      throw new ValidationError('no connector registered for source kind', {
        details: { kind: source.kind },
      });
    }

    const raw = await connector.resolve(path);
    if (raw === undefined) {
      // The file vanished between scan and processing — converge by removing it.
      await forget(source.id, path);
      return;
    }

    const persistedHash = await manifest.get(source.id, path);
    if (persistedHash === raw.contentHash) {
      // Already persisted at this exact content — no re-index (idempotent / incremental).
      return;
    }

    const processed = await runPipeline(pipeline, decodeDocument(source, raw));
    await sink.upsert(processed);
    await manifest.set(source.id, path, raw.contentHash);
    await events?.emit('document.ingested', { document: processed });
  }

  return { subscription: queue.subscribe<ChangeEvent>(topic, handle) };
}
