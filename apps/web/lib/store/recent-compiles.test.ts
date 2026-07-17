import { beforeEach, describe, expect, it } from 'vitest';
import {
  RECENT_COMPILES_LIMIT,
  rememberCompile,
  useRecentCompiles,
  type RecentCompile,
} from '@/lib/store/recent-compiles';

function entry(task: string, budget = 2000): RecentCompile {
  return { task, budget, at: '2026-07-17T10:00:00.000Z' };
}

describe('rememberCompile', () => {
  it('puts the newest first', () => {
    const result = rememberCompile([entry('older')], entry('newer'));
    expect(result.map((e) => e.task)).toEqual(['newer', 'older']);
  });

  it('moves a repeated task to the top rather than duplicating it', () => {
    // Re-running the same task at a different budget is the SAME task. Two near-identical rows would
    // push the useful history off the end of the list.
    const existing = [entry('b'), entry('a')];
    const result = rememberCompile(existing, entry('a', 8000));

    expect(result.map((e) => e.task)).toEqual(['a', 'b']);
    expect(result[0]?.budget).toBe(8000); // and it carries the newer budget
  });

  it('caps the list, dropping the oldest', () => {
    let entries: readonly RecentCompile[] = [];
    for (let i = 0; i < RECENT_COMPILES_LIMIT + 5; i += 1) {
      entries = rememberCompile(entries, entry(`task-${i}`));
    }

    expect(entries).toHaveLength(RECENT_COMPILES_LIMIT);
    expect(entries[0]?.task).toBe(`task-${RECENT_COMPILES_LIMIT + 4}`);
    expect(entries.some((e) => e.task === 'task-0')).toBe(false);
  });

  it('keeps the filters a task was run with', () => {
    const [first] = rememberCompile([], { ...entry('a'), kinds: ['code', 'memory'] });
    expect(first?.kinds).toEqual(['code', 'memory']);
  });
});

describe('useRecentCompiles', () => {
  beforeEach(() => useRecentCompiles.getState().clear());

  it('stamps a time when remembering', () => {
    useRecentCompiles.getState().remember({ task: 'explain fusion', budget: 2000 });

    const [first] = useRecentCompiles.getState().entries;
    expect(first?.task).toBe('explain fusion');
    expect(Number.isNaN(Date.parse(first!.at))).toBe(false);
  });

  it('clears everything — the sign-out contract', () => {
    // Task text is user-authored ("audit the auth bypass in payments"). It must not survive into the
    // next person's session on a shared machine.
    useRecentCompiles.getState().remember({ task: 'audit the auth bypass', budget: 2000 });
    useRecentCompiles.getState().clear();

    expect(useRecentCompiles.getState().entries).toEqual([]);
  });
});
