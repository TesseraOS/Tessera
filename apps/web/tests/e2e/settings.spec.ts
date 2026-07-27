import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

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

  await page.goto('/settings');

  // Deployment: the API endpoint + a real dependency check from /ready.
  await expect(page.getByText('API endpoint')).toBeVisible();
  await expect(page.getByText('sqlite')).toBeVisible();
  // Feature flags (F-058), evaluated for this tenant — the value AND the rule that decided it.
  await expect(page.getByText('beta.search')).toBeVisible();
  await expect(page.getByText('Override for this workspace')).toBeVisible();
  await expect(page.getByText('legacy.compile')).toBeVisible();
  // Read-only: flags come from deployment config, so the card must ship no control (ADR-0022).
  await expect(page.getByRole('switch')).toHaveCount(0);
  // Budgets from /v1/billing/plans.
  await expect(page.getByText('8,000')).toBeVisible();
  // Governance posture is read-only (no fake controls).
  await expect(page.getByText('Governance & retention')).toBeVisible();

  // a11y runs with the flags table POPULATED — the state the card is actually in for an operator.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
