import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

let seq = 0;
function event(over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `a${seq}`,
    tenantId: 'default',
    actor: { principalId: 'writer-1', kind: 'token' },
    action: 'memory.write',
    target: 'lin-42',
    outcome: 'success',
    at: '2026-07-04T10:00:00.000Z',
    ...over,
  };
}

// Stub the audit API (the app ships no mock data — ADR-0022).
//
// The export route is registered LAST on purpose: the page glob also matches `/v1/audit/export`, and
// Playwright resolves routes last-registered-first — so a page stub registered afterwards would
// silently intercept the export and fulfil it with a page-shaped body. That presents as a baffling
// failure rather than an obvious one.
//
// (These are line comments, not a JSDoc block, because a `**/` glob inside a block comment TERMINATES
// it — the same family as the `--`-in-an-XML-comment bug this repo has met before.)
async function stubAudit(
  page: Page,
  options: { page1?: unknown; export?: unknown } = {},
): Promise<{ exportCalls: string[] }> {
  const exportCalls: string[] = [];

  await page.route('**/v1/audit*', (route) =>
    route.fulfill({ json: options.page1 ?? { events: [event(), event({ outcome: 'denied' })] } }),
  );
  await page.route('**/v1/audit/export*', (route) => {
    exportCalls.push(route.request().url());
    return route.fulfill({
      json: options.export ?? {
        exportedAt: '2026-07-17T10:00:00.000Z',
        count: 2,
        truncated: false,
        events: [event(), event({ outcome: 'denied' })],
      },
    });
  });

  return { exportCalls };
}

test('audit log renders events with outcomes, filters, and passes a11y', async ({ page }) => {
  await stubAudit(page);
  await page.goto('/audit');

  await expect(page.getByText('writer-1').first()).toBeVisible();
  await expect(page.getByText('denied')).toBeVisible();
  await expect(page.getByLabel('Filter by action')).toBeVisible();

  // Table semantics survive virtualization: the grid is declared explicitly because a virtualized
  // <table> cannot keep its implicit roles. axe checks the STRUCTURE (required children/parent).
  const grid = page.getByRole('table', { name: 'Audit events' });
  await expect(grid).toBeVisible();
  await expect(grid).toHaveAttribute('aria-rowcount', '-1'); // unknown total, honestly stated

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('the empty trail passes a11y — no orphan rowgroup', async ({ page }) => {
  await stubAudit(page, { page1: { events: [] } });
  await page.goto('/audit');
  await expect(page.getByText('No audit events')).toBeVisible();

  // F-061 shipped a CRITICAL axe violation that only an empty state revealed. A virtualized grid
  // with zero rows is an aria-required-children candidate — audit it directly.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('pages the trail with the cursor instead of telling the user to narrow the filters', async ({
  page,
}) => {
  let call = 0;
  await page.route('**/v1/audit*', (route) => {
    call += 1;
    return route.fulfill({
      json:
        call === 1
          ? { events: [event({ target: '/page-1' })], nextCursor: '42' }
          : { events: [event({ target: '/page-2' })] },
    });
  });

  await page.goto('/audit');
  await expect(page.getByText('/page-1')).toBeVisible();

  // The hint this feature deletes. The component had a working cursor and told the user to change
  // the subject instead of using it.
  await expect(page.getByText(/narrow the filters to see older entries/i)).toBeHidden();
  await expect(page.getByRole('status')).toContainText('more available');

  await page.getByRole('button', { name: /load older events/i }).click();

  // Older events APPEND — a reader never loses what they already had.
  await expect(page.getByText('/page-2')).toBeVisible();
  await expect(page.getByText('/page-1')).toBeVisible();
  await expect(page.getByRole('button', { name: /load older events/i })).toBeHidden();
  await expect(page.getByRole('status')).toContainText('end of the trail');
});

test('actor and date-range filters reach the API', async ({ page }) => {
  const urls: string[] = [];
  await page.route('**/v1/audit*', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ json: { events: [event()] } });
  });

  await page.goto('/audit');
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();

  await page.getByLabel('Filter by actor').fill('writer-1');
  // `exact` is load-bearing: getByLabel substring-matches, and "To" is inside "Filter by ac-TO-r".
  // (RTL's getByLabelText is exact by default, so the unit test could not have caught this.)
  await page.getByLabel('From', { exact: true }).fill('2026-07-01');
  await page.getByLabel('To', { exact: true }).fill('2026-07-04');

  await expect
    .poll(() => urls.at(-1))
    .toMatch(
      /actor=writer-1.*since=2026-07-01T00%3A00%3A00.000Z.*until=2026-07-04T23%3A59%3A59.999Z/,
    );
});

test('exports the filtered trail, and the export is itself audited', async ({ page }) => {
  const { exportCalls } = await stubAudit(page);
  await page.goto('/audit');
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();

  await page.getByLabel('Filter by actor').fill('writer-1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /export/i }).click();
  await page.getByText('Download CSV').click();

  // The export asks with the CURRENT filters — an export is defined by its filters, not by the page
  // the reader happened to reach. The server then pages it to completeness.
  await expect.poll(() => exportCalls.at(-1)).toContain('actor=writer-1');
  expect((await download).suggestedFilename()).toMatch(/^tessera-audit-.*\.csv$/);
});

test('says when an export was truncated rather than implying it was complete', async ({ page }) => {
  await stubAudit(page, {
    export: {
      exportedAt: '2026-07-17T10:00:00.000Z',
      count: 50_000,
      truncated: true,
      events: [event()],
    },
  });
  await page.goto('/audit');
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /export/i }).click();
  await page.getByText('Download JSON').click();
  await download;

  // A truncated export that says so is honest; a silent one is the trap.
  await expect(page.getByText(/most recent matching events/i)).toBeVisible();
});

test('governance shows the roles matrix + retention and passes a11y', async ({ page }) => {
  await page.goto('/governance');

  await expect(page.getByText('Roles & permissions')).toBeVisible();
  await expect(page.getByText('admin:manage')).toBeVisible();
  await expect(page.getByText('Audit retention')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
