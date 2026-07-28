import { describe, expect, it } from 'vitest';
import type { NotificationPage } from '@tessera/sdk';
import { markReadInPage } from '@/lib/api/hooks';
import { describeNotification, severityToneClass } from '@/lib/notifications';

function page(notifications: NotificationPage['notifications']): NotificationPage {
  return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
}

function row(overrides: Partial<NotificationPage['notifications'][number]> = {}) {
  return {
    id: 'n1',
    kind: 'scan.failed' as const,
    severity: 'error' as const,
    actor: { principalId: 'local', kind: 'local' as const },
    at: '2026-01-01T00:00:00.000Z',
    read: false,
    ...overrides,
  };
}

describe('describeNotification', () => {
  it('turns a kind into a sentence — the API sends none', () => {
    expect(describeNotification('scan.failed')).toMatchObject({
      title: 'Source scan failed',
      description: 'Indexing stopped before finishing; open Sources for detail.',
    });
  });

  it('has copy and an icon for every kind, so none renders as a raw identifier', () => {
    const kinds = [
      'memory.captured',
      'scan.completed',
      'scan.failed',
      'token.changed',
      'plan.changed',
    ] as const;
    for (const kind of kinds) {
      const described = describeNotification(kind);
      expect(described.icon, kind).toBeDefined();
      expect(described.title, kind).not.toContain('.');
      expect(described.description.length, kind).toBeGreaterThan(10);
    }
  });
});

describe('severityToneClass', () => {
  it('tints only error — colour that is everywhere means nothing', () => {
    expect(severityToneClass('error')).toBe('text-destructive');
    expect(severityToneClass('info')).toBeNull();
    // No warning token exists in the design system; the distinct icon carries it, which WCAG 1.4.1
    // requires anyway.
    expect(severityToneClass('warning')).toBeNull();
  });
});

describe('markReadInPage', () => {
  it('marks the row and decrements the badge', () => {
    const result = markReadInPage(page([row(), row({ id: 'n2' })]), 'n1');
    expect(result.notifications[0]?.read).toBe(true);
    expect(result.notifications[1]?.read).toBe(false);
    expect(result.unreadCount).toBe(1);
  });

  it('is a no-op for an already-read row, so a double click cannot double-decrement', () => {
    const before = page([row({ read: true })]);
    expect(markReadInPage(before, 'n1')).toBe(before);
  });

  it('is a no-op for an id not on this page', () => {
    const before = page([row()]);
    expect(markReadInPage(before, 'missing')).toBe(before);
  });

  it('never drives the badge below zero', () => {
    // The count is bounded to a window, so a row outside it would otherwise take it negative.
    const skewed: NotificationPage = { notifications: [row()], unreadCount: 0 };
    expect(markReadInPage(skewed, 'n1').unreadCount).toBe(0);
  });
});
