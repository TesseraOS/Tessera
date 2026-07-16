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

/** Stub `GET /v1/stats` (the app ships no mock data — ADR-0022; stub at the network boundary). */
async function stubStats(page: Page, json: unknown = STATS): Promise<void> {
  await page.route('**/v1/stats', (route) => route.fulfill({ json }));
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
    await stubEvents(page);
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Overview' }).first()).toBeVisible();
    await expect(page.getByText('Indexed documents')).toBeVisible();
  });

  test('stat cards show the real workspace numbers', async ({ page }) => {
    await stubStats(page);
    await stubEvents(page);
    await page.goto('/');

    // The regression F-060 fixes: these were hardcoded '—'/'0' while the API held real data.
    await expect(page.getByText('1,234')).toBeVisible();
    await expect(page.getByText('87')).toBeVisible();
    await expect(page.getByText('12')).toBeVisible();
  });

  test('an emitted event appears in the activity feed and the notifications bell', async ({
    page,
  }) => {
    await stubStats(page);
    await stubEvents(page, [
      { type: 'memory.captured', data: { lineageId: 'l1', kind: 'decision', title: 'Adopt SSE' } },
      {
        type: 'source.scan.completed',
        data: {
          sourceId: 's1',
          kind: 'git',
          label: 'acme/repo',
          summary: { added: 3, modified: 0, removed: 0, unchanged: 1 },
        },
      },
    ]);
    await page.goto('/');

    // The feed replaces the permanent "No activity yet" block with what actually arrived.
    const feed = page.getByRole('list', { name: 'Recent activity' });
    await expect(feed.getByText('acme/repo')).toBeVisible();
    await expect(feed.getByText('scan completed — 3 added')).toBeVisible();
    await expect(feed.getByText('Adopt SSE')).toBeVisible();
    await expect(page.getByText('No activity this session')).toBeHidden();

    // The bell counts the same events as unread, and opening it clears the badge.
    const badge = page.getByTestId('notifications-badge');
    await expect(badge).toHaveText('2');

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByRole('list', { name: 'Recent notifications' })).toContainText(
      'Adopt SSE',
    );
    await page.keyboard.press('Escape');
    await expect(badge).toBeHidden();
  });

  test('shows an honest empty feed when nothing has happened this session', async ({ page }) => {
    await stubStats(page, {
      documents: 0,
      memories: 0,
      graph: { nodes: 0, effectLinks: 0 },
      sources: 0,
      lastScanAt: null,
    });
    await stubEvents(page);
    await page.goto('/');

    // Scoped to the session — it must not claim nothing has ever happened (F-065 persists).
    await expect(page.getByText('No activity this session')).toBeVisible();
    await expect(page.getByTestId('notifications-badge')).toBeHidden();
  });

  test('opens the command palette with the keyboard', async ({ page }) => {
    await stubStats(page);
    await stubEvents(page);
    await page.goto('/');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByPlaceholder('Search or jump to…')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Search or jump to…')).toBeHidden();
  });

  test('has no detectable WCAG A/AA accessibility violations', async ({ page }) => {
    await stubStats(page);
    // Populated, so axe audits the real feed + bell markup rather than only the empty state.
    await stubEvents(page, [
      { type: 'memory.captured', data: { lineageId: 'l1', kind: 'decision', title: 'Adopt SSE' } },
    ]);
    await page.goto('/');
    await expect(page.getByText('Adopt SSE')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });
});
