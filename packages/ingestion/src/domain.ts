import { createHash } from 'node:crypto';
import type { Id, TenantId } from '@tessera/core';

/** Identifies a configured ingestion source (one connector instance). */
export type SourceId = Id<'Source'>;

/** Stable identifier for an ingested document. */
export type DocumentId = Id<'Document'>;

/** A configured source a connector ingests from (e.g. a repo root). */
export interface SourceDescriptor {
  readonly id: SourceId;
  /** Connector kind, e.g. `'filesystem'` or `'git'`. */
  readonly kind: string;
  /** Human-readable label (e.g. the root path or repo name). */
  readonly label: string;
}

/** How a path changed between two scans. */
export type ChangeKind = 'added' | 'modified' | 'removed';

/**
 * A unit of change emitted by a connector and enqueued for a worker. Plain, JSON-serializable
 * data so it survives a real queue transport (BullMQ) unchanged. Content is resolved lazily by
 * the worker via the connector — the event stays small.
 */
export interface ChangeEvent {
  readonly source: SourceDescriptor;
  /** Source-relative, `/`-delimited path. */
  readonly path: string;
  readonly changeKind: ChangeKind;
  /** Content hash for `added`/`modified` (absent for `removed`). */
  readonly contentHash?: string;
}

/** One current entry in a source: a path and the hash of its content. */
export interface SourceEntry {
  readonly path: string;
  readonly contentHash: string;
}

/** Structured, JSON-safe, non-sensitive metadata attached to a document. */
export type DocumentMetadata = Readonly<Record<string, unknown>>;

/** Raw content a connector resolves for a path, before processing. */
export interface RawDocument {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly contentHash: string;
  readonly metadata: DocumentMetadata;
}

/** Coarse content classification, used to route processing and retrieval. */
export type DocumentKind = 'code' | 'markdown' | 'text' | 'binary';

/** A single secret-redaction outcome: which detector matched and how many times. Never the value. */
export interface RedactionFinding {
  readonly detector: string;
  readonly count: number;
}

/**
 * A document after the processor pipeline: normalized, **secret-scrubbed** text plus provenance.
 * This is what reaches the {@link DocumentSink}; raw content with secrets is never persisted.
 */
export interface ProcessedDocument {
  readonly id: DocumentId;
  readonly source: SourceDescriptor;
  readonly path: string;
  readonly kind: DocumentKind;
  readonly contentHash: string;
  /** Normalized + redacted text. Empty for binary documents. */
  readonly text: string;
  readonly metadata: DocumentMetadata;
  readonly redactions: readonly RedactionFinding[];
}

/** Counts of what a scan found, by change kind plus the untouched remainder (FR-8). */
export interface ScanSummary {
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
  readonly unchanged: number;
}

/**
 * Typed domain events emitted by the ingestion worker + source service (consumed by SSE/dashboards).
 * The composition root bridges these to the API's SSE stream (`document.*` from the worker;
 * `source.scan.*` lifecycle from the source service). Payloads stay JSON-safe and non-sensitive.
 *
 * **Tenancy (ADR-0050).** The scan-lifecycle events carry the tenant that owns the source, because
 * the source service resolves it from the registry record. The `document.*` events do **not**: they
 * come off the queue in the worker, which has no tenant — the same gap that makes ingestion write to
 * the default tenant (F-071). Rather than invent an attribution the worker cannot know, the type
 * says so, and the composition root's SSE bridge attributes them to the tenant ingestion actually
 * wrote to. When F-071 carries the tenant onto the queue job, the field belongs here too.
 */
export interface IngestionEvents extends Record<string, unknown> {
  readonly 'document.ingested': { readonly document: ProcessedDocument };
  readonly 'document.removed': { readonly sourceId: SourceId; readonly path: string };
  /**
   * One queued change event finished processing — emitted for **every** outcome (F-081).
   *
   * This exists because `document.ingested`/`document.removed` are *not* a ledger of work done:
   * the worker returns silently when a path's persisted hash already matches (idempotent re-scan),
   * emitting nothing while still having processed the job. Counting those events for scan progress
   * therefore stalls below total — a bar stuck at 90% is worse than no bar. This fires regardless,
   * so "how much of this scan is done" has an honest source.
   *
   * **Domain-internal, not for the wire.** Consumers must de-duplicate by `path`: the queue may
   * retry a handler, so this can fire more than once for the same job (see `SourceService`, which
   * counts distinct paths).
   */
  readonly 'document.processed': { readonly sourceId: SourceId; readonly path: string };
  readonly 'source.scan.started': {
    readonly sourceId: SourceId;
    readonly tenantId: TenantId;
    readonly kind: string;
    readonly label: string;
    /**
     * How many changed paths this scan will process — known once the diff is done, so a client can
     * show a determinate bar from the first frame. `0` is a real answer (nothing changed).
     */
    readonly total: number;
  };
  /** Progress of a running scan (F-081). `processed` counts distinct paths, so it never regresses. */
  readonly 'source.scan.progress': {
    readonly sourceId: SourceId;
    readonly tenantId: TenantId;
    readonly kind: string;
    readonly label: string;
    readonly processed: number;
    readonly total: number;
  };
  /** A scan ended in failure (F-081). The request that started it is long gone — do not swallow it. */
  readonly 'source.scan.failed': {
    readonly sourceId: SourceId;
    readonly tenantId: TenantId;
    readonly kind: string;
    readonly label: string;
    readonly error: string;
  };
  readonly 'source.scan.completed': {
    readonly sourceId: SourceId;
    readonly tenantId: TenantId;
    readonly kind: string;
    readonly label: string;
    readonly summary: ScanSummary;
  };
}

/** Separator between source id and path when deriving a document id (source ids never contain it). */
const ID_SEPARATOR = ':';

/**
 * Deterministic document id for a `(source, path)` pair. Stable across re-ingest so the same
 * document upserts in place — the foundation of idempotent processing (FR-8). Never random.
 */
export function documentIdFor(sourceId: SourceId, path: string): DocumentId {
  const digest = createHash('sha256').update(`${sourceId}${ID_SEPARATOR}${path}`).digest('hex');
  return digest as DocumentId;
}
