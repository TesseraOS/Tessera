import { describe, expect, it } from 'vitest';
import { createInMemoryMemoryStore } from '../adapters/in-memory-memory-store.js';
import { createMemoryService } from './memory-service.js';
import {
  EMPTY_RETENTION_POLICY,
  pruneMemories,
  resolveRetentionRule,
  type MemoryRetentionPolicy,
} from './retention.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-16T00:00:00.000Z');

/** A store seeded via the service; returns the store so the pass can run directly against it. */
function seededService() {
  const store = createInMemoryMemoryStore();
  return { store, service: createMemoryService(store) };
}

describe('resolveRetentionRule', () => {
  const policy: MemoryRetentionPolicy = {
    rules: [
      { maxAgeMs: 90 * DAY }, // catch-all
      { kind: 'task', maxAgeMs: 7 * DAY }, // kind-specific
      { kind: 'task', scope: 'api', maxAgeMs: 1 * DAY }, // most specific
    ],
  };

  it('picks the most-specific matching rule (kind+scope > kind > catch-all)', () => {
    expect(resolveRetentionRule(policy, 'task', 'api')?.maxAgeMs).toBe(1 * DAY);
    expect(resolveRetentionRule(policy, 'task', 'global')?.maxAgeMs).toBe(7 * DAY);
    expect(resolveRetentionRule(policy, 'decision', 'global')?.maxAgeMs).toBe(90 * DAY);
  });

  it('returns undefined when no rule matches', () => {
    expect(resolveRetentionRule({ rules: [{ kind: 'task' }] }, 'decision', 'x')).toBeUndefined();
    expect(resolveRetentionRule(EMPTY_RETENTION_POLICY, 'task', 'x')).toBeUndefined();
  });
});

describe('pruneMemories', () => {
  it('is a no-op under the empty policy (retention off by default)', async () => {
    const { store, service } = seededService();
    await service.capture({ kind: 'task', title: 'T', body: 'b' });
    expect(await pruneMemories(store, EMPTY_RETENTION_POLICY, { now: NOW })).toEqual({
      expiredLineages: 0,
      prunedVersions: 0,
    });
    expect((await service.list()).length).toBe(1);
  });

  it('expires a whole lineage older than the matching rule maxAgeMs', async () => {
    const { store, service } = seededService();
    const old = await service.capture({ kind: 'task', title: 'stale', body: 'b' });
    // Freshly captured (createdAt ~ real now, well before NOW+... ) — make the rule tight so it expires.
    const result = await pruneMemories(
      store,
      { rules: [{ kind: 'task', maxAgeMs: -1 }] }, // any positive age > -1 ⇒ expire
      { now: NOW },
    );
    expect(result.expiredLineages).toBe(1);
    expect(await service.getCurrent(old.lineageId)).toBeUndefined();
  });

  it('keeps a lineage newer than maxAgeMs and never touches its current version', async () => {
    const { store, service } = seededService();
    const fresh = await service.capture({ kind: 'decision', title: 'keep', body: 'b' });
    const result = await pruneMemories(
      store,
      { rules: [{ kind: 'decision', maxAgeMs: 365 * DAY }] },
      { now: NOW },
    );
    expect(result.expiredLineages).toBe(0);
    expect((await service.getCurrent(fresh.lineageId))?.id).toBe(fresh.id);
  });

  it('compacts superseded versions past maxSupersededVersions, keeping the current one', async () => {
    const { store, service } = seededService();
    const v1 = await service.capture({ kind: 'lesson', title: 'L', body: 'v1' });
    await service.edit(v1.lineageId, { body: 'v2' });
    await service.edit(v1.lineageId, { body: 'v3' });
    const current = await service.edit(v1.lineageId, { body: 'v4' }); // 3 superseded + 1 current

    // Keep only the newest 1 superseded version ⇒ prune the 2 oldest superseded.
    const result = await pruneMemories(
      store,
      { rules: [{ kind: 'lesson', maxSupersededVersions: 1 }] },
      { now: NOW },
    );
    expect(result).toEqual({ expiredLineages: 0, prunedVersions: 2 });

    const versions = await service.history(v1.lineageId);
    // The current head survives; exactly one superseded version is retained.
    expect(versions.some((m) => m.id === current.id)).toBe(true);
    expect(versions.filter((m) => m.supersededBy !== null).length).toBe(1);
    expect(versions.length).toBe(2);
  });

  it('expiry takes precedence over compaction (whole lineage removed)', async () => {
    const { store, service } = seededService();
    const v1 = await service.capture({ kind: 'incident', title: 'I', body: 'v1' });
    await service.edit(v1.lineageId, { body: 'v2' });

    const result = await pruneMemories(
      store,
      { rules: [{ kind: 'incident', maxAgeMs: -1, maxSupersededVersions: 5 }] },
      { now: NOW },
    );
    expect(result.expiredLineages).toBe(1);
    expect(result.prunedVersions).toBe(0);
    expect(await service.history(v1.lineageId)).toEqual([]);
  });

  it('prunes are tenant-scoped through the service', async () => {
    const { service } = seededService();
    const a = service.forTenant('tenant-a');
    const b = service.forTenant('tenant-b');
    await a.capture({ kind: 'task', title: 'A', body: 'b' });
    const keep = await b.capture({ kind: 'task', title: 'B', body: 'b' });

    const result = await a.prune({ rules: [{ kind: 'task', maxAgeMs: -1 }] }, { now: NOW });
    expect(result.expiredLineages).toBe(1);
    expect(await a.list()).toEqual([]);
    // Tenant B is untouched.
    expect((await b.list()).map((m) => m.id)).toEqual([keep.id]);
  });
});
