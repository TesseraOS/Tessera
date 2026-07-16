import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendEntry,
  FEED_LIMIT,
  useNotifications,
  type FeedEntry,
} from '@/lib/store/notifications';

function entry(id: string): FeedEntry {
  return { id, type: 'memory.captured', at: '2026-07-16T10:00:00.000Z', data: {} };
}

describe('appendEntry', () => {
  it('prepends newest-first', () => {
    const result = appendEntry([entry('a')], entry('b'));
    expect(result.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('caps the feed, dropping the oldest', () => {
    let entries: readonly FeedEntry[] = [];
    for (let i = 0; i < FEED_LIMIT + 10; i += 1) entries = appendEntry(entries, entry(`e${i}`));

    expect(entries).toHaveLength(FEED_LIMIT);
    expect(entries[0]?.id).toBe(`e${FEED_LIMIT + 9}`); // newest kept
    expect(entries.some((e) => e.id === 'e0')).toBe(false); // oldest dropped
  });
});

describe('useNotifications', () => {
  beforeEach(() => useNotifications.getState().clear());

  it('counts unread as events since the bell was last opened', () => {
    const { push } = useNotifications.getState();
    push('memory.captured', { title: 'One' });
    push('document.ingested', { path: 'a.ts' });
    expect(useNotifications.getState().unread).toBe(2);

    useNotifications.getState().markRead();
    expect(useNotifications.getState().unread).toBe(0);
    // The entries stay — marking read is not deleting.
    expect(useNotifications.getState().entries).toHaveLength(2);

    push('memory.captured', { title: 'Two' });
    expect(useNotifications.getState().unread).toBe(1);
  });

  it('gives every entry a distinct id even within the same millisecond', () => {
    const { push } = useNotifications.getState();
    for (let i = 0; i < 5; i += 1) push('memory.captured', { title: `m${i}` });

    // Ids key React's list — a collision would drop rows from the feed.
    const ids = useNotifications.getState().entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('clears everything on sign-out so activity never bleeds between sessions', () => {
    const { push } = useNotifications.getState();
    push('memory.captured', { title: 'Private' });
    useNotifications.getState().clear();

    expect(useNotifications.getState().entries).toEqual([]);
    expect(useNotifications.getState().unread).toBe(0);
  });
});
