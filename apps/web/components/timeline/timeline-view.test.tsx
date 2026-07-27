import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Enough rows to prove the wiring, and no more. It was 500 — but the jsdom stub renders EVERY row,
 * so 500 full timeline rows rendered three times took ~12s and blew the default 5s timeout under
 * parallel load, taking two unrelated memory tests down with it through CPU contention. The
 * windowing claim belongs in e2e (tests/e2e/timeline.spec.ts), where 500 rows cost nothing because
 * the real virtualizer renders a window.
 */
const MANY = Array.from({ length: 40 }, (_, index) => ({
  lineageId: `lin-${String(index)}`,
  id: `mem-${String(index)}`,
  kind: 'decision' as const,
  title: `Decision number ${String(index)}`,
  body: 'body',
  version: 1,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  supersededBy: null,
  scope: null,
  source: null,
  tags: [],
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    listMemories: vi.fn(async () => ({ memories: MANY })),
    getAudit: vi.fn(async () => ({ events: [] })),
  },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

vi.mock('@/lib/api/events', () => ({ useLiveActivity: () => [] }));

// jsdom has no layout, so the real virtualizer measures a 0-height viewport and renders nothing;
// stub it to render every row. This is the same shim `memory-view.test.tsx` uses, and it means the
// WINDOWING claim cannot be made here — it is asserted in tests/e2e/timeline.spec.ts, where there is
// real layout. What this file can prove is the ARIA structure, which is what the absolute
// positioning actually threatens.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 76,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 76,
        size: 76,
      })),
    measureElement: () => {},
  }),
}));

import { TimelineView } from '@/components/timeline/timeline-view';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TimelineView virtualization (F-064; FR-49)', () => {
  it('drives the list from the virtualizer, so the row set is windowable at all', async () => {
    renderWithClient(<TimelineView />);

    const list = await screen.findByRole('list');
    // Under the stub every row renders, so this asserts the wiring, not the windowing: the list is
    // sized by the virtualizer's total and each row is absolutely positioned at its offset. Delete
    // the virtualizer and the height/transform disappear.
    expect(list.style.height).toBe(`${String(MANY.length * 76)}px`);
    // Inline styles, not Tailwind classes — jsdom does no CSS resolution, so `position: absolute`
    // from a class is unobservable here; the offset transform is what the virtualizer itself writes.
    const items = list.querySelectorAll<HTMLElement>('li');
    expect(items[0]?.style.transform).toBe('translateY(0px)');
    expect(items[3]?.style.transform).toBe(`translateY(${String(3 * 76)}px)`);
  });

  it('keeps NATIVE list semantics — the roles are implicit, not declared', async () => {
    renderWithClient(<TimelineView />);

    const list = await screen.findByRole('list');
    // Absolutely-positioned <li> keep their listitem role in Chromium — verified in
    // tests/e2e/timeline.spec.ts by removing the explicit roles and watching axe still pass. So
    // declaring them would be the redundancy `jsx-a11y/no-redundant-roles` exists to catch, and the
    // tags carry the meaning on their own.
    expect(list.tagName).toBe('OL');
    expect(list.hasAttribute('role')).toBe(false);
    expect(screen.getAllByRole('listitem')).toHaveLength(MANY.length);
  });

  it('keeps the rendered rows as DIRECT children of the list (aria-required-children)', async () => {
    renderWithClient(<TimelineView />);

    const list = await screen.findByRole('list');
    for (const item of screen.getAllByRole('listitem')) {
      expect(item.parentElement).toBe(list);
    }
  });
});
