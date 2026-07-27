import AxeBuilder from '@axe-core/playwright';
// @playwright/test directly, NOT the fixtures: this spec reads REAL billing data, so it needs a real
// session cookie rather than the fixtures' `/v1/me` stub.
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TOKEN_API = 'http://127.0.0.1:3000';

async function signIn(page: import('@playwright/test').Page, token: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('API token').fill(token);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/signin/);
}

async function tokenFor(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const response = await request.get(`${TOKEN_API}/e2e/token`);
  return ((await response.json()) as { token: string }).token;
}

/**
 * **F-057 increment 10** — Billing against the real API.
 *
 * The e2e server runs `metered: true` (see `token-api-server.mjs`), so this exercises the metered
 * branch: the plan, the entitlement, and usage measured against it. The *unmetered* branch — where
 * the upgrade CTA must be absent rather than disabled — is covered by the RTL suite, because a second
 * server would have to be booted to reach it here and the assertion is identical.
 */

test('billing renders the plan, entitlements and usage against the limit, and passes a11y', async ({
  page,
  request,
}) => {
  await signIn(page, await tokenFor(request));
  await page.goto('/billing');

  await expect(page.getByText('Current plan')).toBeVisible();
  // The free plan's entitlements, straight from the catalog the API serves.
  await expect(page.getByText('Compiles / month')).toBeVisible();
  await expect(page.getByText('8,000')).toBeVisible();

  // Metered ⇒ the usage meter is present AND is announced, not merely drawn.
  await expect(page.getByText('Usage this month')).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('billing is reachable from the sidebar footer', async ({ page, request }) => {
  await signIn(page, await tokenFor(request));
  await page.goto('/');
  await page.getByRole('link', { name: 'Billing' }).click();
  await expect(page).toHaveURL(/\/billing$/);
});
