import type { Memory, MemoryKind } from '../domain.js';
import type { MemoryStore } from '../ports/memory-store.js';

/**
 * One memory retention rule (FR-15). A rule matches a memory by `kind` and/or `scope` (omit a field to
 * match every value); the **most-specific** matching rule wins (kind+scope > kind > scope > neither) and
 * only that rule's thresholds are applied. Thresholds:
 * - `maxAgeMs` — **expiry**: a lineage whose current version is older than this is deleted outright.
 * - `maxSupersededVersions` / `maxSupersededAgeMs` — **compaction**: prune already-superseded versions
 *   (never the current one) beyond a count and/or older than an age.
 *
 * The pass never edits content and never touches a kept lineage's current version, so the
 * never-silently-mutate contract (FR-12) is preserved — retention only *deletes*.
 */
export interface MemoryRetentionRule {
  readonly kind?: MemoryKind;
  readonly scope?: string;
  /** Expire a lineage whose current version's `createdAt` is older than this many ms. Omit ⇒ never expire. */
  readonly maxAgeMs?: number;
  /** Keep at most this many superseded versions per lineage (newest kept). Omit ⇒ keep all. */
  readonly maxSupersededVersions?: number;
  /** Prune superseded versions older than this many ms. Omit ⇒ no age-based compaction. */
  readonly maxSupersededAgeMs?: number;
}

/** A memory retention policy (FR-15): an ordered set of {@link MemoryRetentionRule rules}. */
export interface MemoryRetentionPolicy {
  readonly rules: readonly MemoryRetentionRule[];
}

/** The no-op policy — the default, so retention is off unless configured (byte-stable local behavior). */
export const EMPTY_RETENTION_POLICY: MemoryRetentionPolicy = { rules: [] };

/** What a {@link pruneMemories} pass removed. */
export interface PruneResult {
  /** Whole lineages deleted by an `maxAgeMs` expiry. */
  readonly expiredLineages: number;
  /** Individual superseded versions compacted away. */
  readonly prunedVersions: number;
}

export interface PruneOptions {
  /** The clock; defaults to `new Date()`. Injected for deterministic tests. */
  readonly now?: Date;
}

/** True if `rule` applies to a memory of this `kind`/`scope`. */
function matches(rule: MemoryRetentionRule, kind: MemoryKind, scope: string): boolean {
  return (
    (rule.kind === undefined || rule.kind === kind) &&
    (rule.scope === undefined || rule.scope === scope)
  );
}

/** kind+scope (3) > kind (2) > scope (1) > neither (0). */
function specificity(rule: MemoryRetentionRule): number {
  return (rule.kind !== undefined ? 2 : 0) + (rule.scope !== undefined ? 1 : 0);
}

/** The most-specific rule that applies to a memory of `kind`/`scope`, or `undefined` if none match. */
export function resolveRetentionRule(
  policy: MemoryRetentionPolicy,
  kind: MemoryKind,
  scope: string,
): MemoryRetentionRule | undefined {
  let best: MemoryRetentionRule | undefined;
  let bestScore = -1;
  for (const rule of policy.rules) {
    if (!matches(rule, kind, scope)) continue;
    const score = specificity(rule);
    // First-match-wins on ties: only a strictly more specific rule replaces the current best.
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

/** Age of a version in ms at `nowMs` (0 if its timestamp is unparseable or in the future). */
function ageMs(memory: Memory, nowMs: number): number {
  const created = Date.parse(memory.createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, nowMs - created);
}

/**
 * Apply a {@link MemoryRetentionPolicy} to a (tenant-scoped) {@link MemoryStore} (FR-15). For each
 * lineage: if its current version has aged past the matching rule's `maxAgeMs`, the whole lineage is
 * expired; otherwise superseded versions are compacted past `maxSupersededVersions`/`maxSupersededAgeMs`.
 * Deletion only — no version's content is ever altered. Deterministic given `options.now`.
 */
export async function pruneMemories(
  store: MemoryStore,
  policy: MemoryRetentionPolicy,
  options: PruneOptions = {},
): Promise<PruneResult> {
  const nowMs = (options.now ?? new Date()).getTime();
  let expiredLineages = 0;
  let prunedVersions = 0;

  for (const head of await store.listCurrent()) {
    const rule = resolveRetentionRule(policy, head.kind, head.scope);
    if (rule === undefined) continue;

    // Expiry — delete the whole lineage; nothing left to compact.
    if (rule.maxAgeMs !== undefined && ageMs(head, nowMs) > rule.maxAgeMs) {
      await store.deleteLineage(head.lineageId);
      expiredLineages += 1;
      continue;
    }

    // Compaction — only already-superseded versions (never the current head).
    if (rule.maxSupersededVersions === undefined && rule.maxSupersededAgeMs === undefined) continue;
    const superseded = (await store.listVersions(head.lineageId)).filter(
      (version) => version.supersededBy !== null,
    );
    const keepFrom =
      rule.maxSupersededVersions === undefined
        ? 0
        : Math.max(0, superseded.length - rule.maxSupersededVersions);
    for (let index = 0; index < superseded.length; index += 1) {
      const version = superseded[index]!;
      const overCount = index < keepFrom;
      const tooOld =
        rule.maxSupersededAgeMs !== undefined && ageMs(version, nowMs) > rule.maxSupersededAgeMs;
      if (overCount || tooOld) {
        await store.deleteVersion(version.id);
        prunedVersions += 1;
      }
    }
  }

  return { expiredLineages, prunedVersions };
}
