import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const STATS = {
  documents: 1234,
  memories: 12,
  graph: { nodes: 512, effectLinks: 87 },
  sources: 3,
  lastScanAt: '2026-07-16T10:00:00.000Z',
};

/** Two persisted trail rows (F-089) — what the feed and the bell render. Newest first. */
const RECENT = {
  events: [
    {
      id: 'evt-2',
      action: 'source.manage',
      target: '/v1/sources/:id/scan',
      actor: { principalId: 'local', kind: 'local' },
      at: '2026-07-16T10:00:00.000Z',
    },
    {
      id: 'evt-1',
      action: 'memory.write',
      target: '/v1/memory',
      actor: { principalId: 'local', kind: 'local' },
      at: '2026-07-16T09:00:00.000Z',
    },
  ],
};

/** Stub `GET /v1/stats` (the app ships no mock data — ADR-0022; stub at the network boundary). */
async function stubStats(page: Page, json: unknown = STATS): Promise<void> {
  await page.route('**/v1/stats', (route) => route.fulfill({ json }));
}

/** Stub the persisted Recent activity feed (F-089). */
async function stubRecent(page: Page, json: unknown = RECENT): Promise<void> {
  await page.route('**/v1/stats/activity/recent*', (route) => route.fulfill({ json }));
}

/**
 * Stub the SSE stream. `frames` are written into the response body as real `event:`/`data:` frames,
 * so the client parses the same wire format the API emits (the server's half of this contract is
 * proven against a real bus in `apps/api`'s sse e2e). A long `retry` hint keeps EventSource from
 * reconnecting mid-test.
 */
async function stubEvents(
  page: Page,
  frames: readonly { type: string; data: unknown }[] = [],
): Promise<void> {
  const body = [
    'retry: 100000\n\n',
    ': connected\n\n',
    ...frames.map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f.data)}\n\n`),
  ].join('');
  await page.route('**/v1/events', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body }),
  );
}

test.describe('Dashboard shell', () => {
  test('renders the overview with sidebar navigation', async ({ page }) => {
    await stubStats(page);
    await stubRecent(page);
    await stubEvents(page);
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Overview' }).first()).toBeVisible();
    await expect(page.getByText('Indexed documents')).toBeVisible();
  });

  test('stat cards show the real workspace numbers', async ({ page }) => {
    await stubStats(page);
    await stubRecent(page);
    await stubEvents(page);
    await page.goto('/');

    // The regression F-060 fixes: these were hardcoded '—'/'0' while the API held real data.
    await expect(page.getByText('1,234')).toBeVisible();
    await expect(page.getByText('87')).toBeVisible();
    await expect(page.getByText('12')).toBeVisible();
  });

  test('the feed renders the persisted trail, and a stream event refreshes it (F-089)', async ({
    page,
  }) => {
    await stubStats(page);
    // First fetch: the trail is empty. The SSE frame then invalidates the query (ActivitySync) and
    // the refetch serves the new row — the live path, end to end, with no session store involved.
    let calls = 0;
    await page.route('**/v1/stats/activity/recent*', (route) => {
      calls += 1;
      void route.fulfill({ json: calls === 1 ? { events: [] } : RECENT });
    });
    await stubEvents(page, [
      { type: 'memory.captured', data: { lineageId: 'l1', kind: 'decision', title: 'Adopt SSE' } },
    ]);
    await page.goto('/');

    const feed = page.getByRole('list', { name: 'Recent activity' });
    await expect(feed.getByText('Memory captured')).toBeVisible();
    await expect(feed.getByText('Source scan started')).toBeVisible();

    // The bell counts the same persisted rows as unread.
    await expect(page.getByTestId('notifications-badge')).toHaveText('2');
  });

  test('per-message read marks survive a reload; mark-all clears the badge (F-089)', async ({
    page,
  }) => {
    await stubStats(page);
    await stubRecent(page);
    await stubEvents(page);
    await page.goto('/');

    const badge = page.getByTestId('notifications-badge');
    await expect(badge).toHaveText('2');

    // Opening the bell claims nothing (F-060 cleared everything on open — that is gone).
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(badge).toHaveText('2');

    // Mark ONE message read; the menu stays open and the badge counts down.
    await page.getByRole('button', { name: 'Source scan started — mark as read' }).click();
    await expect(badge).toHaveText('1');
    await expect(page.getByTestId('notification-unread-dot')).toHaveCount(1);
    await page.keyboard.press('Escape');

    // The mark is persisted per device — a reload must not resurrect the read message.
    await page.reload();
    await expect(page.getByTestId('notifications-badge')).toHaveText('1');

    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByTestId('notifications-badge')).toBeHidden();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByTestId('notifications-badge')).toBeHidden();
  });

  test('shows an honest empty feed when the trail has no recorded activity', async ({ page }) => {
    await stubStats(page, {
      documents: 0,
      memories: 0,
      graph: { nodes: 0, effectLinks: 0 },
      sources: 0,
      lastScanAt: null,
    });
    await stubRecent(page, { events: [] });
    await stubEvents(page);
    await page.goto('/');

    // Persisted now — no session scoping anywhere in the copy (F-089; user items 4/6/9).
    await expect(page.getByText('No recorded activity yet')).toBeVisible();
    await expect(page.getByText(/this session/)).toHaveCount(0);
    await expect(page.getByTestId('notifications-badge')).toBeHidden();
  });

  test('opens the command palette with the keyboard', async ({ page }) => {
    await stubStats(page);
    await stubRecent(page);
    await stubEvents(page);
    await page.goto('/');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByPlaceholder('Search or jump to…')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Search or jump to…')).toBeHidden();
  });

  test('has no detectable WCAG A/AA accessibility violations', async ({ page }) => {
    await stubStats(page);
    // Populated, so axe audits the real feed markup rather than only the empty state.
    await stubRecent(page);
    await stubEvents(page);
    await page.goto('/');
    await expect(page.getByText('Memory captured')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });

  test('the populated bell passes the same axe sweep', async ({ page }) => {
    await stubStats(page);
    await stubRecent(page);
    await stubEvents(page);
    await page.goto('/');

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByRole('list', { name: 'Recent notifications' })).toBeVisible();

    // Scoped to the open panel: while it is open, Radix focus management interacts with the rest of
    // the page in ways axe flags wholesale. The full-page sweep runs in the previous test; this one
    // audits the bell markup — dialog semantics (not menu — a11y requires menu children to be menu
    // items, and these rows are real buttons), rows, marks, and the header action.
    const results = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[data-slot="popover-content"]')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
