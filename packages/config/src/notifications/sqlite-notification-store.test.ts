import { runNotificationStoreConformance } from '@tessera/api/conformance';
import { createSqliteStore } from '@tessera/storage';
import { describe, expect, it } from 'vitest';
import { createSqliteNotificationStore } from './sqlite-notification-store.js';

/**
 * The persistent adapter runs the **shared** suite (F-065), not a hand-copied subset — the mistake
 * `sqlite-audit-log.test.ts` documents in its own comments and F-078 exists to undo. The suite is
 * reachable here because it is published on the `@tessera/api/conformance` subpath.
 */
runNotificationStoreConformance('sqlite', () =>
  Promise.resolve({
    store: createSqliteNotificationStore(createSqliteStore({ path: ':memory:' }).db),
  }),
);

describe('createSqliteNotificationStore (persistence)', () => {
  it('survives a reopen — the point of this adapter existing', async () => {
    // Cross-device read state is F-065's reason to exist; a store that forgets on restart would be
    // the localStorage it replaced, one layer down.
    const store = createSqliteStore({ path: ':memory:' });

    const first = createSqliteNotificationStore(store.db).forTenant('acme');
    await first.markAllRead('user-1', '2026-01-01T00:00:10.000Z');
    await first.setPreferences('user-1', { 'scan.failed': false });

    // A second adapter over the same handle is what a restarted process sees.
    const second = createSqliteNotificationStore(store.db).forTenant('acme');
    expect((await second.readState('user-1')).watermark).toBe('2026-01-01T00:00:10.000Z');
    expect((await second.preferences('user-1'))['scan.failed']).toBe(false);
  });

  it('keeps read state and preferences on ONE row without either clobbering the other', async () => {
    // They share a row because they share a lifetime, which makes a partial upsert the risk: writing
    // read state must not null the preferences column, and vice versa.
    const store = createSqliteStore({ path: ':memory:' });
    const notifications = createSqliteNotificationStore(store.db);

    await notifications.setPreferences('user-1', { 'token.changed': false });
    await notifications.markAllRead('user-1', '2026-01-01T00:00:05.000Z');
    expect((await notifications.preferences('user-1'))['token.changed']).toBe(false);

    await notifications.setPreferences('user-1', { 'plan.changed': false });
    expect((await notifications.readState('user-1')).watermark).toBe('2026-01-01T00:00:05.000Z');
  });
});
