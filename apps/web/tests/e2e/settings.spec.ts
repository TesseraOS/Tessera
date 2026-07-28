import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const ALL_KINDS_ON = {
  'memory.captured': true,
  'scan.completed': true,
  'scan.failed': true,
  'token.changed': true,
  'plan.changed': true,
};

/** The card holding a given title — settings is a stack of cards, and assertions must not stray. */
function cardWithTitle(page: import('@playwright/test').Page, title: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: title });
}

const flagsCard = (page: import('@playwright/test').Page) => cardWithTitle(page, 'Feature flags');

/**
 * Stub the notification preferences surface (F-065), holding state in the handler so a toggle can be
 * asserted to have been *saved* rather than merely painted.
 */
async function stubNotificationPreferences(
  page: import('@playwright/test').Page,
): Promise<{ writes: Record<string, boolean>[] }> {
  const writes: Record<string, boolean>[] = [];
  let preferences: Record<string, boolean> = { ...ALL_KINDS_ON };
  await page.route('**/v1/notifications/preferences', async (route) => {
    if (route.request().method() === 'PUT') {
      const update = route.request().postDataJSON() as Record<string, boolean>;
      writes.push(update);
      preferences = { ...preferences, ...update };
    }
    await route.fulfill({ json: { preferences } });
  });
  return { writes };
}

// The app ships no mock data (ADR-0022); stub the read-only settings endpoints for the e2e.
test('settings renders health, dependency checks, budgets, and posture; passes a11y', async ({
  page,
}) => {
  await page.route('**/health', async (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/ready', async (route) => {
    await route.fulfill({
      json: { status: 'ready', checks: [{ name: 'sqlite', ok: true, detail: 'open' }] },
    });
  });
  await page.route('**/v1/flags', async (route) => {
    await route.fulfill({
      json: {
        flags: [
          {
            key: 'beta.search',
            description: 'Rank search results with the new hybrid scorer.',
            enabled: true,
            source: 'tenant-override',
          },
          { key: 'legacy.compile', description: '', enabled: false, source: 'default' },
        ],
      },
    });
  });
  await page.route('**/v1/billing/plans', async (route) => {
    await route.fulfill({
      json: {
        plans: [
          {
            id: 'free',
            name: 'Free',
            priceCents: 0,
            interval: null,
            entitlements: { maxMonthlyCompiles: 1000, maxSeats: 1, maxTokensPerCompile: 8000 },
          },
        ],
      },
    });
  });

  await stubNotificationPreferences(page);

  await page.goto('/settings');

  // Deployment: the API endpoint + a real dependency check from /ready.
  await expect(page.getByText('API endpoint')).toBeVisible();
  await expect(page.getByText('sqlite')).toBeVisible();
  // Feature flags (F-058), evaluated for this tenant — the value AND the rule that decided it.
  await expect(page.getByText('beta.search')).toBeVisible();
  await expect(page.getByText('Override for this workspace')).toBeVisible();
  await expect(page.getByText('legacy.compile')).toBeVisible();
  // Read-only: flags come from deployment config, so the FLAGS card must ship no control
  // (ADR-0022). Scoped to that card — a page-wide switch count stopped meaning "no fake control"
  // the moment F-065 added notification preferences, which are a real write surface.
  await expect(flagsCard(page).getByRole('switch')).toHaveCount(0);
  // Budgets from /v1/billing/plans.
  await expect(page.getByText('8,000')).toBeVisible();
  // Governance posture is read-only (no fake controls).
  await expect(page.getByText('Governance & retention')).toBeVisible();

  // a11y runs with the flags table POPULATED — the state the card is actually in for an operator.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

/**
 * Notification preferences (F-065) — the one write surface on this screen that reaches the server.
 *
 * Asserted through what was SENT, not through what the switch looks like afterwards: a control that
 * flips locally and never saves looks identical until the next page load, which is precisely the
 * failure this feature exists to remove.
 */
test('notification preferences save a PARTIAL update and survive a reload', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/ready', (route) => route.fulfill({ json: { status: 'ready', checks: [] } }));
  await page.route('**/v1/flags', (route) => route.fulfill({ json: { flags: [] } }));
  await page.route('**/v1/billing/plans', (route) => route.fulfill({ json: { plans: [] } }));
  const { writes } = await stubNotificationPreferences(page);

  await page.goto('/settings');

  const card = cardWithTitle(page, 'Notifications');
  // Named by kind, not "Toggle" — five identically-named switches are unusable with a screen reader.
  await expect(card.getByRole('switch', { name: 'Source scan failed' })).toBeChecked();

  await card.getByRole('switch', { name: 'Plan changed' }).click();

  // Only the changed kind is sent. A full record would let a client built before a kind existed
  // mute that kind by omitting it.
  await expect.poll(() => writes).toEqual([{ 'plan.changed': false }]);
  await expect(card.getByRole('switch', { name: 'Plan changed' })).not.toBeChecked();

  await page.reload();
  await expect(
    cardWithTitle(page, 'Notifications').getByRole('switch', { name: 'Plan changed' }),
  ).not.toBeChecked();
});

test('the notification preferences card passes the WCAG A/AA sweep', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/ready', (route) => route.fulfill({ json: { status: 'ready', checks: [] } }));
  await page.route('**/v1/flags', (route) => route.fulfill({ json: { flags: [] } }));
  await page.route('**/v1/billing/plans', (route) => route.fulfill({ json: { plans: [] } }));
  await stubNotificationPreferences(page);

  await page.goto('/settings');
  await expect(cardWithTitle(page, 'Notifications').getByRole('switch')).toHaveCount(5);

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
