import { describe, expect, it } from 'vitest';
import { createInMemoryAuditLog } from '../audit/in-memory.js';
import type { AuditAction, AuditEventInput } from '../audit/model.js';
import type { AuditLog } from '../audit/port.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  EMPTY_READ_STATE,
  NOTIFICATION_KINDS,
  READ_IDS_CAP,
  isRead,
  kindForAction,
  kindsWithSeverity,
  withAllRead,
  withPreferenceDefaults,
  withRead,
  type NotificationPreferences,
} from './model.js';
import { listNotifications, newestNotificationAt, unreadCountFor } from './project.js';

let clock = 0;

/** Append one event to `log`, with a monotonically increasing timestamp. */
async function record(log: AuditLog, overrides: Partial<AuditEventInput> = {}): Promise<void> {
  clock += 1;
  await log.record({
    tenantId: 'default',
    actor: { principalId: 'user-1', kind: 'user' },
    action: 'memory.write',
    outcome: 'success',
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString(),
    ...overrides,
  });
}

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...overrides };
}

const context = { readState: EMPTY_READ_STATE, preferences: DEFAULT_NOTIFICATION_PREFERENCES };

describe('the notification taxonomy', () => {
  it('projects only the audit actions worth interrupting someone for', () => {
    expect(kindForAction('memory.write')).toBe('memory.captured');
    expect(kindForAction('source.scan.completed')).toBe('scan.completed');
    expect(kindForAction('source.scan.failed')).toBe('scan.failed');
    expect(kindForAction('token.manage')).toBe('token.changed');
    expect(kindForAction('billing.manage')).toBe('plan.changed');
  });

  it('projects nothing for the actions that belong in the feed, not the bell', () => {
    const quiet: AuditAction[] = [
      'search',
      'compile',
      'memory.read',
      'audit.read',
      'audit.export',
      'project.manage',
      'retention.manage',
      'notification.manage',
    ];
    for (const action of quiet) {
      expect(kindForAction(action), action).toBeUndefined();
    }
  });

  it('derives severity from kind, so one kind can never present two ways', () => {
    expect(kindsWithSeverity('error')).toEqual(['scan.failed']);
    expect(kindsWithSeverity('warning')).toEqual(['token.changed']);
    expect(kindsWithSeverity('info')).toEqual([
      'memory.captured',
      'scan.completed',
      'plan.changed',
    ]);
  });

  it('defaults an unknown-to-the-store kind to ON, so adding a kind never silently mutes it', () => {
    // A record saved before `scan.failed` existed. The stored kinds keep their answer; the new one
    // gets the same answer a brand-new principal would get.
    const stored = { 'memory.captured': false, 'scan.completed': true };
    const completed = withPreferenceDefaults(stored);
    expect(completed['memory.captured']).toBe(false);
    expect(completed['scan.failed']).toBe(true);
    expect(Object.keys(completed).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it('treats an absent record as every kind on', () => {
    expect(withPreferenceDefaults(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

describe('read-state math', () => {
  it('reads everything at or before the watermark', () => {
    const state = { watermark: '2026-01-01T00:00:10.000Z', readIds: [] };
    expect(isRead({ id: 'a', at: '2026-01-01T00:00:09.000Z' }, state)).toBe(true);
    expect(isRead({ id: 'a', at: '2026-01-01T00:00:10.000Z' }, state)).toBe(true);
    expect(isRead({ id: 'a', at: '2026-01-01T00:00:11.000Z' }, state)).toBe(false);
  });

  it('marks one id idempotently and caps the list', () => {
    const once = withRead(EMPTY_READ_STATE, 'a');
    expect(withRead(once, 'a')).toBe(once);

    let state = EMPTY_READ_STATE;
    for (let i = 0; i < READ_IDS_CAP + 10; i += 1) state = withRead(state, `id-${i}`);
    expect(state.readIds).toHaveLength(READ_IDS_CAP);
    // The OLDEST marks fall off — the newest are the ones still on screen.
    expect(state.readIds[state.readIds.length - 1]).toBe(`id-${READ_IDS_CAP + 9}`);
  });

  it('never moves the watermark backwards', () => {
    const ahead = { watermark: '2026-01-02T00:00:00.000Z', readIds: ['x'] };
    // A client holding a stale page must not be able to un-read newer rows.
    expect(withAllRead(ahead, '2026-01-01T00:00:00.000Z').watermark).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    expect(withAllRead(ahead, '2026-01-03T00:00:00.000Z').watermark).toBe(
      '2026-01-03T00:00:00.000Z',
    );
  });

  it('drops individual marks the watermark already implies', () => {
    const state = { watermark: null, readIds: ['a', 'b'] };
    expect(withAllRead(state, '2026-01-02T00:00:00.000Z').readIds).toEqual([]);
  });
});

describe('listNotifications', () => {
  it('projects successful notifiable events, newest first', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'memory.write' });
    await record(log, { action: 'source.scan.failed' });

    const { notifications } = await listNotifications(log, context);
    expect(notifications.map((n) => n.kind)).toEqual(['scan.failed', 'memory.captured']);
    expect(notifications[0]).toMatchObject({ severity: 'error', read: false });
  });

  it('ignores actions outside the taxonomy entirely', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'search' });
    await record(log, { action: 'compile' });
    await record(log, { action: 'audit.export' });

    const { notifications, unreadCount } = await listNotifications(log, context);
    expect(notifications).toEqual([]);
    expect(unreadCount).toBe(0);
  });

  it('ignores DENIED events — a refused action is the admin trail’s business', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'token.manage', outcome: 'denied' });
    await record(log, { action: 'token.manage', outcome: 'success' });

    const { notifications } = await listNotifications(log, context);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.kind).toBe('token.changed');
  });

  it('filters by kind and by severity', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'memory.write' });
    await record(log, { action: 'source.scan.failed' });
    await record(log, { action: 'token.manage' });

    expect(
      (await listNotifications(log, context, { kinds: ['memory.captured'] })).notifications,
    ).toHaveLength(1);
    const bySeverity = await listNotifications(log, context, { severity: 'error' });
    expect(bySeverity.notifications.map((n) => n.kind)).toEqual(['scan.failed']);
  });

  it('honours preferences: a muted kind leaves the list AND the badge', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'memory.write' });
    await record(log, { action: 'source.scan.failed' });

    const muted = {
      readState: EMPTY_READ_STATE,
      preferences: prefs({ 'memory.captured': false }),
    };
    const { notifications, unreadCount } = await listNotifications(log, muted);
    expect(notifications.map((n) => n.kind)).toEqual(['scan.failed']);
    // A badge counting rows the person asked not to see could never be cleared.
    expect(unreadCount).toBe(1);
  });

  it('returns an empty page — not a query with an empty IN list — when every kind is muted', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'memory.write' });

    const silent = {
      readState: EMPTY_READ_STATE,
      preferences: Object.fromEntries(
        NOTIFICATION_KINDS.map((kind) => [kind, false]),
      ) as NotificationPreferences,
    };
    const page = await listNotifications(log, silent);
    expect(page).toEqual({ notifications: [], unreadCount: 0 });
  });

  it('marks read rows from the principal’s state, and can hide them', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'memory.write' });
    await record(log, { action: 'source.scan.completed' });

    const all = await listNotifications(log, context);
    const readOne = all.notifications[1]!;
    const seen = {
      readState: withRead(EMPTY_READ_STATE, readOne.id),
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    };

    expect((await listNotifications(log, seen)).notifications.map((n) => n.read)).toEqual([
      false,
      true,
    ]);
    const unread = await listNotifications(log, seen, { unreadOnly: true });
    expect(unread.notifications.map((n) => n.id)).toEqual([all.notifications[0]!.id]);
    expect(unread.unreadCount).toBe(1);
  });

  it('paginates with an exact cursor even though unreadOnly filters after the query', async () => {
    const log = createInMemoryAuditLog();
    for (let i = 0; i < 5; i += 1) await record(log, { action: 'memory.write' });

    const first = await listNotifications(log, context, { limit: 2 });
    expect(first.notifications).toHaveLength(2);
    expect(first.nextCursor).toBeDefined();

    const second = await listNotifications(log, context, { limit: 2, cursor: first.nextCursor! });
    expect(second.notifications).toHaveLength(2);
    // No overlap, no gap: the cursor is the trail's, so post-filtering cannot corrupt it.
    const ids = [...first.notifications, ...second.notifications].map((n) => n.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('can return a SHORT page while more remain — the documented cost of post-filtering', async () => {
    const log = createInMemoryAuditLog();
    for (let i = 0; i < 4; i += 1) await record(log, { action: 'memory.write' });

    const all = await listNotifications(log, context);
    const seen = {
      readState: { watermark: null, readIds: all.notifications.slice(0, 2).map((n) => n.id) },
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    };

    const page = await listNotifications(log, seen, { limit: 2, unreadOnly: true });
    expect(page.notifications).toEqual([]);
    // Shorter than `limit`, yet there IS more — a client must page on the cursor, not on length.
    expect(page.nextCursor).toBeDefined();
  });

  it('clamps limit to the maximum page size', async () => {
    const log = createInMemoryAuditLog();
    for (let i = 0; i < 60; i += 1) await record(log, { action: 'memory.write' });
    const page = await listNotifications(log, context, { limit: 500 });
    expect(page.notifications).toHaveLength(50);
  });
});

describe('unreadCountFor / newestNotificationAt', () => {
  it('counts unread within the bounded window, ignoring the watermark’s past', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'memory.write' });
    await record(log, { action: 'memory.write' });
    const { notifications } = await listNotifications(log, context);

    expect(await unreadCountFor(log, context)).toBe(2);
    const marked = {
      readState: withAllRead(EMPTY_READ_STATE, notifications[0]!.at),
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    };
    expect(await unreadCountFor(log, marked)).toBe(0);
  });

  it('reads the newest instant from the store, not from a client’s page', async () => {
    const log = createInMemoryAuditLog();
    expect(await newestNotificationAt(log, DEFAULT_NOTIFICATION_PREFERENCES)).toBeNull();

    await record(log, { action: 'memory.write' });
    await record(log, { action: 'source.scan.failed' });
    const newest = await newestNotificationAt(log, DEFAULT_NOTIFICATION_PREFERENCES);
    const { notifications } = await listNotifications(log, context);
    expect(newest).toBe(notifications[0]!.at);
  });

  it('excludes muted kinds from the newest instant, so marking all read cannot claim them', async () => {
    const log = createInMemoryAuditLog();
    await record(log, { action: 'memory.write' });
    await record(log, { action: 'source.scan.failed' });

    const onlyMemory = prefs({ 'scan.failed': false });
    const newest = await newestNotificationAt(log, onlyMemory);
    const visible = await listNotifications(log, {
      readState: EMPTY_READ_STATE,
      preferences: onlyMemory,
    });
    expect(newest).toBe(visible.notifications[0]!.at);
  });
});
