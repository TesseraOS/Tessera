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
  readonly 'source.scan.started': {
    readonly sourceId: SourceId;
    readonly tenantId: TenantId;
    readonly kind: string;
    readonly label: string;
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
