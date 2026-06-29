import { ValidationError } from '@tessera/core';
import type { Queue } from '@tessera/storage';
import type { ChangeEvent, SourceDescriptor } from '../domain.js';
import type { Connector } from '../ports/connector.js';
import type { IngestionManifest } from '../ports/manifest.js';
import { diffEntries } from '../connectors/scan-diff.js';
import { INGESTION_TOPIC } from './worker.js';

export interface IngestionCoordinatorOptions {
  /** Queue to publish change events to (consumed by {@link createIngestionWorker}). */
  readonly queue: Queue;
  /** Connector that lists the source; its `kind` must match `source.kind`. */
  readonly connector: Connector;
  /** Descriptor for the source being scanned. */
  readonly source: SourceDescriptor;
  /** The content-hash index the scan diffs against (advanced by the worker, not here). */
  readonly manifest: IngestionManifest;
  /** Queue topic to publish to (default {@link INGESTION_TOPIC}). */
  readonly topic?: string;
}

/** Counts of what a scan found, by change kind plus the untouched remainder. */
export interface ScanSummary {
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
  readonly unchanged: number;
}

export interface IngestionCoordinator {
  /** Scan the source, enqueue change events, and report what changed. */
  scan(): Promise<ScanSummary>;
}

/**
 * Drive a connector against the queue (FR-6): a {@link IngestionCoordinator.scan} lists the source,
 * diffs it against the manifest, and enqueues only the change events — so a small change never
 * triggers a full re-index (FR-8). It deliberately does **not** advance the manifest; the worker
 * does that after a successful persist, preserving at-least-once, idempotent semantics.
 */
export function createIngestionCoordinator(
  options: IngestionCoordinatorOptions,
): IngestionCoordinator {
  const { queue, connector, source, manifest } = options;
  const topic = options.topic ?? INGESTION_TOPIC;

  if (connector.kind !== source.kind) {
    throw new ValidationError('connector kind does not match source kind', {
      details: { connectorKind: connector.kind, sourceKind: source.kind },
    });
  }

  return {
    async scan() {
      const [entries, prior] = await Promise.all([connector.list(), manifest.snapshot(source.id)]);
      const events = diffEntries(source, entries, prior);
      await Promise.all(events.map((event: ChangeEvent) => queue.enqueue(topic, event)));

      const added = events.filter((event) => event.changeKind === 'added').length;
      const modified = events.filter((event) => event.changeKind === 'modified').length;
      const removed = events.filter((event) => event.changeKind === 'removed').length;
      return { added, modified, removed, unchanged: entries.length - added - modified };
    },
  };
}
