import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, LOCAL_IDENTITY, LOCAL_RBAC } from './support/fixtures';

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

/**
 * A stateful `/v1/notifications` stub (F-065) that behaves like the real server: read marks are held
 * **here**, not in the browser, and every response is computed from them.
 *
 * Stateful rather than a fixed fixture because the claim under test is precisely that read state
 * lives on the server. A stub that echoed whatever the client sent could not tell a cross-device
 * mark from a `localStorage` one — which is the bug F-089 shipped and this feature exists to fix.
 */
interface NotificationServerState {
  readonly read: Set<string>;
  watermark: string | null;
}

/** Fresh server-side state. Pass one object to two pages to model two devices, one server. */
function notificationState(): NotificationServerState {
  return { read: new Set<string>(), watermark: null };
}

async function stubNotifications(
  page: Page,
  rows: readonly { id: string; kind: string; severity: string; at: string }[],
  state: NotificationServerState = notificationState(),
): Promise<void> {
  const { read } = state;
  const body = () => {
    const notifications = rows.map((row) => ({
      ...row,
      actor: { principalId: 'local', kind: 'local' },
      read: read.has(row.id) || (state.watermark !== null && row.at <= state.watermark),
    }));
    return {
      notifications,
      unreadCount: notifications.filter((row) => !row.read).length,
    };
  };

  await page.route('**/v1/notifications?*', (route) => route.fulfill({ json: body() }));
  await page.route('**/v1/notifications', (route) => route.fulfill({ json: body() }));
  await page.route('**/v1/notifications/read', async (route) => {
    const payload = route.request().postDataJSON() as { ids: string[] };
    for (const id of payload.ids) read.add(id);
    await route.fulfill({
      json: { watermark: state.watermark, readIds: [...read], unreadCount: body().unreadCount },
    });
  });
  await page.route('**/v1/notifications/read-all', async (route) => {
    // The server picks the watermark from its own newest row — the request carries no instant.
    state.watermark = rows.reduce<string | null>(
      (newest, row) => (newest === null || row.at > newest ? row.at : newest),
      null,
    );
    read.clear();
    await route.fulfill({ json: { watermark: state.watermark, readIds: [], unreadCount: 0 } });
  });
  await page.route('**/v1/notifications/preferences', (route) =>
    route.fulfill({
      json: {
        preferences: {
          'memory.captured': true,
          'scan.completed': true,
          'scan.failed': true,
          'token.changed': true,
          'plan.changed': true,
        },
      },
    }),
  );
}

/** Two notifications, newest first — what the bell renders (F-065). */
const NOTIFICATIONS = [
  { id: 'ntf-2', kind: 'scan.completed', severity: 'info', at: '2026-07-16T10:00:00.000Z' },
  { id: 'ntf-1', kind: 'memory.captured', severity: 'info', at: '2026-07-16T09:00:00.000Z' },
];

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
    //
    // `exact` matters and is not tidiness (F-064). A substring match on '12' also matched the feed's
    // relative timestamps — "12d ago" — so this test passed or failed depending on the DATE it ran:
    // a dormant time bomb that went off once the fixture's 2026-07-16 entries were 12 days old.
    await expect(page.getByText('1,234', { exact: true })).toBeVisible();
    await expect(page.getByText('87', { exact: true })).toBeVisible();
    await expect(page.getByText('12', { exact: true })).toBeVisible();
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
    await stubNotifications(page, NOTIFICATIONS);
    await stubEvents(page, [
      { type: 'memory.captured', data: { lineageId: 'l1', kind: 'decision', title: 'Adopt SSE' } },
    ]);
    await page.goto('/');

    const feed = page.getByRole('list', { name: 'Recent activity' });
    await expect(feed.getByText('Memory captured')).toBeVisible();
    await expect(feed.getByText('Source scan started')).toBeVisible();

    // The bell counts unread from the notification surface — a projection of the same trail, but a
    // separate endpoint since F-065, so this pins that the two stay wired to one another.
    await expect(page.getByTestId('notifications-badge')).toHaveText('2');
  });

  test('per-message read marks live on the SERVER; mark-all clears the badge (F-065)', async ({
    page,
  }) => {
    await stubStats(page);
    await stubRecent(page);
    await stubNotifications(page, NOTIFICATIONS);
    await stubEvents(page);
    await page.goto('/');

    const badge = page.getByTestId('notifications-badge');
    await expect(badge).toHaveText('2');

    // Opening the bell claims nothing (F-060 cleared everything on open — that is gone).
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(badge).toHaveText('2');

    // Mark ONE message read; the panel stays open and the badge counts down.
    await page.getByRole('button', { name: 'Source scan finished — mark as read' }).click();
    await expect(badge).toHaveText('1');
    await expect(page.getByTestId('notification-unread-dot')).toHaveCount(1);
    await page.keyboard.press('Escape');

    // A reload must not resurrect it — the mark was written to the server, not this browser.
    await page.reload();
    await expect(page.getByTestId('notifications-badge')).toHaveText('1');

    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByTestId('notifications-badge')).toBeHidden();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByTestId('notifications-badge')).toBeHidden();
  });

  test('a mark made in one browser is already read in another — CROSS-DEVICE (F-065)', async ({
    page,
    browser,
  }) => {
    // The claim F-065 exists for, and the one F-089's `localStorage` marks could not make.
    //
    // Two browser CONTEXTS share no cookies and no storage — they are two devices. **One** state
    // object backs both stubs, standing in for the one server, so the mark made in the first is
    // genuinely the mark the second reads back. If the client kept marks locally, the second context
    // would show two unread and this fails.
    const server = notificationState();
    await stubStats(page);
    await stubRecent(page);
    await stubNotifications(page, NOTIFICATIONS, server);
    await stubEvents(page);
    await page.goto('/');

    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('button', { name: 'Source scan finished — mark as read' }).click();
    await expect(page.getByTestId('notifications-badge')).toHaveText('1');

    const second = await browser.newContext();
    try {
      const other = await second.newPage();
      // The identity stubs the fixture applies to `page` do not reach a hand-made context; without
      // them this second "device" redirects to sign-in and proves nothing.
      await other.route('**/v1/me', (route) => route.fulfill({ json: LOCAL_IDENTITY }));
      await other.route('**/v1/rbac', (route) => route.fulfill({ json: LOCAL_RBAC }));
      await stubStats(other);
      await stubRecent(other);
      await stubNotifications(other, NOTIFICATIONS, server);
      await stubEvents(other);
      await other.goto('/');

      await expect(other.getByTestId('notifications-badge')).toHaveText('1');
      await other.getByRole('button', { name: /Notifications/ }).click();
      await expect(other.getByTestId('notification-unread-dot')).toHaveCount(1);
    } finally {
      await second.close();
    }
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
    await stubNotifications(page, []);
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
    await stubNotifications(page, NOTIFICATIONS);
    await stubEvents(page);
    await page.goto('/');
    await expect(page.getByText('Memory captured')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });

  test('the populated bell passes the same axe sweep', async ({ page }) => {
    await stubStats(page);
    await stubRecent(page);
    await stubNotifications(page, NOTIFICATIONS);
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
