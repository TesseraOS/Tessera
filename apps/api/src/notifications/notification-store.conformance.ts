import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  EMPTY_READ_STATE,
  NOTIFICATION_KINDS,
  READ_IDS_CAP,
} from './model.js';
import type { NotificationStore } from './port.js';

export interface NotificationStoreHarness {
  store: NotificationStore;
  cleanup?: () => Promise<void>;
}

/** Builds a fresh, isolated {@link NotificationStore} per test. */
export type NotificationStoreFactory = () => Promise<NotificationStoreHarness>;

const AT = (seconds: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

/**
 * The behavioural contract every {@link NotificationStore} adapter must satisfy (F-065; ADR-0064).
 *
 * The two isolation cases are the reason this suite exists rather than a per-adapter test: this
 * store is the *only* place notification state is persisted, and a leak between tenants or between
 * two people sharing a workspace is silent — one person clears a badge and someone else's clears
 * with it.
 */
export function runNotificationStoreConformance(
  name: string,
  makeStore: NotificationStoreFactory,
): void {
  describe(`NotificationStore conformance: ${name}`, () => {
    it('starts empty: no read state, default preferences', async () => {
      const { store, cleanup } = await makeStore();
      try {
        expect(await store.readState('user-1')).toEqual(EMPTY_READ_STATE);
        expect(await store.preferences('user-1')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      } finally {
        await cleanup?.();
      }
    });

    it('marks ids read, idempotently, and persists them', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.markRead('user-1', ['a', 'b']);
        await store.markRead('user-1', ['b']);
        const state = await store.readState('user-1');
        expect([...state.readIds].sort()).toEqual(['a', 'b']);
      } finally {
        await cleanup?.();
      }
    });

    it('caps individually-marked ids, dropping the oldest', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const ids = Array.from({ length: READ_IDS_CAP + 5 }, (_, i) => `id-${i}`);
        await store.markRead('user-1', ids);
        const state = await store.readState('user-1');
        expect(state.readIds).toHaveLength(READ_IDS_CAP);
        expect(state.readIds).toContain(`id-${READ_IDS_CAP + 4}`);
        expect(state.readIds).not.toContain('id-0');
      } finally {
        await cleanup?.();
      }
    });

    it('moves the watermark forward only, and clears the ids it implies', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.markRead('user-1', ['a']);
        await store.markAllRead('user-1', AT(20));
        expect(await store.readState('user-1')).toEqual({ watermark: AT(20), readIds: [] });

        // A client holding a stale page must not be able to un-read newer rows.
        await store.markAllRead('user-1', AT(10));
        expect((await store.readState('user-1')).watermark).toBe(AT(20));

        await store.markAllRead('user-1', AT(30));
        expect((await store.readState('user-1')).watermark).toBe(AT(30));
      } finally {
        await cleanup?.();
      }
    });

    it('merges partial preference updates instead of replacing the record', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.setPreferences('user-1', { 'scan.failed': false });
        await store.setPreferences('user-1', { 'plan.changed': false });

        const preferences = await store.preferences('user-1');
        expect(preferences['scan.failed']).toBe(false);
        expect(preferences['plan.changed']).toBe(false);
        // Untouched kinds keep the default — a client that predates a kind cannot mute it by omission.
        expect(preferences['memory.captured']).toBe(true);
        expect(Object.keys(preferences).sort()).toEqual([...NOTIFICATION_KINDS].sort());
      } finally {
        await cleanup?.();
      }
    });

    it('returns a COMPLETE preference record, every kind present', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const returned = await store.setPreferences('user-1', { 'token.changed': false });
        expect(Object.keys(returned).sort()).toEqual([...NOTIFICATION_KINDS].sort());
        expect(returned).toEqual(await store.preferences('user-1'));
      } finally {
        await cleanup?.();
      }
    });

    it('isolates two principals in ONE tenant — a shared workspace is not a shared inbox', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.markRead('alice', ['n1']);
        await store.markAllRead('alice', AT(50));
        await store.setPreferences('alice', { 'scan.failed': false });

        expect(await store.readState('bob')).toEqual(EMPTY_READ_STATE);
        expect(await store.preferences('bob')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      } finally {
        await cleanup?.();
      }
    });

    it('isolates tenants, even for the same principal id', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const acme = store.forTenant('acme');
        const globex = store.forTenant('globex');

        await acme.markRead('user-1', ['n1']);
        await acme.setPreferences('user-1', { 'memory.captured': false });

        expect(await globex.readState('user-1')).toEqual(EMPTY_READ_STATE);
        expect(await globex.preferences('user-1')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
        // …and the base view (the default tenant) sees neither.
        expect(await store.readState('user-1')).toEqual(EMPTY_READ_STATE);
      } finally {
        await cleanup?.();
      }
    });

    it('forgets a principal entirely — read state AND preferences (DSR erasure)', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.markAllRead('user-1', AT(10));
        await store.setPreferences('user-1', { 'scan.failed': false });
        await store.forget('user-1');

        expect(await store.readState('user-1')).toEqual(EMPTY_READ_STATE);
        expect(await store.preferences('user-1')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      } finally {
        await cleanup?.();
      }
    });

    it('prunes stale read state but never a stored preference', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.markAllRead('stale', AT(10));
        await store.setPreferences('stale', { 'plan.changed': false });

        // Everything is older than a negative age, so this prunes whatever it is willing to prune.
        expect(await store.prune({ readStateMaxAgeMs: -1 })).toBe(1);
        expect(await store.readState('stale')).toEqual(EMPTY_READ_STATE);
        // The setting survives: reverting a mute because somebody was away would start an alert
        // firing again without anyone choosing it.
        expect((await store.preferences('stale'))['plan.changed']).toBe(false);
      } finally {
        await cleanup?.();
      }
    });

    it('prunes nothing when the policy sets no age, and nothing recent', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.markAllRead('user-1', AT(10));
        expect(await store.prune({})).toBe(0);
        expect(await store.prune({ readStateMaxAgeMs: 60_000 })).toBe(0);
        expect((await store.readState('user-1')).watermark).toBe(AT(10));
      } finally {
        await cleanup?.();
      }
    });

    it('prunes within the bound tenant only', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.forTenant('acme').markAllRead('user-1', AT(10));
        await store.forTenant('globex').markAllRead('user-1', AT(10));

        expect(await store.forTenant('acme').prune({ readStateMaxAgeMs: -1 })).toBe(1);
        expect((await store.forTenant('globex').readState('user-1')).watermark).toBe(AT(10));
      } finally {
        await cleanup?.();
      }
    });
  });
}
