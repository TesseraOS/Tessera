import { beforeEach, describe, expect, it } from 'vitest';
import { useQuickAction } from '@/lib/store/quick-action';

describe('useQuickAction (F-064; FR-49)', () => {
  beforeEach(() => {
    useQuickAction.setState({ pending: null });
  });

  it('hands the request to the matching consumer', () => {
    useQuickAction.getState().request('capture-memory');

    expect(useQuickAction.getState().consume('capture-memory')).toBe(true);
  });

  it('is ONE-SHOT — a second consumer, or a remount, gets nothing', () => {
    useQuickAction.getState().request('add-source');

    expect(useQuickAction.getState().consume('add-source')).toBe(true);
    // Without this, navigating away and back would pop the dialog open again, and a user who
    // dismissed it once would keep meeting it.
    expect(useQuickAction.getState().consume('add-source')).toBe(false);
    expect(useQuickAction.getState().pending).toBeNull();
  });

  it('does not let one route consume another route’s request', () => {
    useQuickAction.getState().request('capture-memory');

    expect(useQuickAction.getState().consume('add-source')).toBe(false);
    // …and the real target still gets it.
    expect(useQuickAction.getState().consume('capture-memory')).toBe(true);
  });

  it('is inert when nothing was requested', () => {
    expect(useQuickAction.getState().consume('capture-memory')).toBe(false);
  });
});
