import type { Id } from '@tessera/core';

/**
 * First-class memory kinds (FR-10). Decisions/ADRs, lessons, incidents, failures, architecture
 * facts, glossary terms, and task notes — each a distinct kind so retrieval and governance can
 * treat them differently.
 */
export const MEMORY_KINDS = [
  'decision',
  'lesson',
  'incident',
  'failure',
  'architecture',
  'glossary',
  'task',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** True if `value` is a known {@link MemoryKind}. */
export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === 'string' && (MEMORY_KINDS as readonly string[]).includes(value);
}

/** Identifies a single memory **version**. */
export type MemoryId = Id<'Memory'>;

/** Stable identity of a memory **across versions** (its lineage). */
export type MemoryLineageId = Id<'MemoryLineage'>;

/**
 * Provenance and linkage for a memory (FR-11). Non-sensitive, JSON-safe. Timestamps, scope, and
 * confidence are first-class {@link Memory} fields (ARCHITECTURE §5), not buried here.
 */
export interface MemoryMetadata {
  /** Where it came from, e.g. `'manual'`, `'adr:0015'`, a commit sha. */
  readonly source?: string;
  /** Who captured it. */
  readonly author?: string;
  /** Related references (memory ids, urls, file paths, symbols). */
  readonly links?: readonly string[];
  /** Free-form tags for grouping/filtering. */
  readonly tags?: readonly string[];
}

/**
 * One immutable version of a memory. Editing never mutates an existing version — it appends a new
 * version that {@link Memory.supersedes} the previous one (FR-12). The **current** version of a
 * lineage is the one with `supersededBy === null`.
 */
export interface Memory {
  /** This version's id. */
  readonly id: MemoryId;
  /** Stable lineage id, shared by every version of this memory. */
  readonly lineageId: MemoryLineageId;
  readonly kind: MemoryKind;
  readonly title: string;
  readonly body: string;
  /** Where the memory applies, e.g. `'global'`, a repo, module, or path. */
  readonly scope: string;
  /** Confidence in the memory, `0..1`. */
  readonly confidence: number;
  readonly metadata: MemoryMetadata;
  /** 1-based version number within the lineage. */
  readonly version: number;
  /** The prior version this one supersedes (`null` for the first version). */
  readonly supersedes: MemoryId | null;
  /** The next version that supersedes this one (`null` while this is the current version). */
  readonly supersededBy: MemoryId | null;
  /** ISO-8601 creation time of this version. */
  readonly createdAt: string;
}
