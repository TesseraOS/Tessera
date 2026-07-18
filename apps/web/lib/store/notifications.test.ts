import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_READ_STATE,
  identityKeyOf,
  isRead,
  READ_IDS_CAP,
  unreadCount,
  useNotificationsRead,
  withAllRead,
  withRead,
  type ReadState,
} from '@/lib/store/notifications';

const entry = (id: string, at: string) => ({ id, at });

describe('read-state math (F-089)', () => {
  it('everything is unread under the empty state', () => {
    const entries = [
      entry('a', '2026-07-18T10:00:00.000Z'),
      entry('b', '2026-07-18T11:00:00.000Z'),
    ];
    expect(unreadCount(entries, EMPTY_READ_STATE)).toBe(2);
  });

  it('marks a single message read, idempotently', () => {
    let state = withRead(EMPTY_READ_STATE, 'a');
    state = withRead(state, 'a');

    expect(state.readIds).toEqual(['a']);
    expect(isRead(entry('a', '2026-07-18T10:00:00.000Z'), state)).toBe(true);
    expect(isRead(entry('b', '2026-07-18T10:00:00.000Z'), state)).toBe(false);
  });

  it('mark-all watermarks the newest entry; older entries are read, newer are not', () => {
    const state = withAllRead(EMPTY_READ_STATE, '2026-07-18T11:00:00.000Z');

    expect(isRead(entry('old', '2026-07-18T10:59:00.000Z'), state)).toBe(true);
    expect(isRead(entry('at-mark', '2026-07-18T11:00:00.000Z'), state)).toBe(true);
    expect(isRead(entry('newer', '2026-07-18T11:01:00.000Z'), state)).toBe(false);
  });

  it('the watermark never moves backwards', () => {
    let state = withAllRead(EMPTY_READ_STATE, '2026-07-18T11:00:00.000Z');
    state = withAllRead(state, '2026-07-18T09:00:00.000Z'); // a stale "all read" must not unread anything

    expect(state.watermark).toBe('2026-07-18T11:00:00.000Z');
  });

  it('mark-all prunes individual marks — they are implied by the watermark', () => {
    let state = withRead(EMPTY_READ_STATE, 'a');
    state = withAllRead(state, '2026-07-18T11:00:00.000Z');

    expect(state.readIds).toEqual([]);
  });

  it('caps individual marks, dropping the oldest', () => {
    let state: ReadState = EMPTY_READ_STATE;
    for (let i = 0; i < READ_IDS_CAP + 10; i += 1) state = withRead(state, `id-${i}`);

    expect(state.readIds).toHaveLength(READ_IDS_CAP);
    expect(state.readIds.includes('id-0')).toBe(false);
    expect(state.readIds.includes(`id-${READ_IDS_CAP + 9}`)).toBe(true);
  });

  it('keys read state per identity so shared-browser users never share marks', () => {
    expect(identityKeyOf(null)).toBe('default:local');
    expect(identityKeyOf({ tenantId: 'acme', principal: { id: 'u1' } })).toBe('acme:u1');
  });
});

describe('useNotificationsRead', () => {
  beforeEach(() => useNotificationsRead.getState().clear());

  it('tracks marks per identity', () => {
    useNotificationsRead.getState().markRead('acme:u1', 'evt-1');
    useNotificationsRead.getState().markAllRead('globex:u2', '2026-07-18T11:00:00.000Z');

    const state = useNotificationsRead.getState().byIdentity;
    expect(state['acme:u1']?.readIds).toEqual(['evt-1']);
    expect(state['globex:u2']?.watermark).toBe('2026-07-18T11:00:00.000Z');
    expect(state['acme:u1']?.watermark).toBeNull();
  });

  it('clears everything on sign-out so marks never bleed between users', () => {
    useNotificationsRead.getState().markRead('acme:u1', 'evt-1');
    useNotificationsRead.getState().clear();

    expect(useNotificationsRead.getState().byIdentity).toEqual({});
  });
});
