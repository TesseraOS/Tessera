import { expect, test } from '@playwright/test';

/**
 * F-067 truth checks — the legal pages' claims, executed against the production build.
 * pages.spec.ts already covers h1/axe/overflow/sitemap/llms for these routes; this
 * spec proves the surface-specific facts: routes resolve, the footer legal nav exists,
 * placeholders cannot silently vanish, and the cookie policy's storage claims are
 * literally true (see lib/legal/cookies.ts — wording and assertions move together).
 */

const LEGAL_ROUTES = ['/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/imprint'];

test('every legal route responds 200', async ({ page }) => {
  for (const route of LEGAL_ROUTES) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} must resolve`).toBe(200);
  }
});

test('the footer exposes a legal nav whose four links resolve', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const legalNav = page.getByRole('navigation', { name: 'legal' });
  await expect(legalNav).toBeVisible();
  for (const route of LEGAL_ROUTES) {
    await expect(legalNav.locator(`a[href="${route}"]`)).toHaveCount(1);
  }
});

for (const route of ['/legal/privacy', '/legal/imprint']) {
  test(`${route} renders visible counsel-review placeholders`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);

    const callouts = page.getByRole('note', { name: 'Pending counsel review' });
    expect(await callouts.count()).toBeGreaterThanOrEqual(1);
    await expect(callouts.first()).toBeVisible();
  });
}

test('cookie-policy claims are executable: no cookies, theme key only after toggle, same-origin only', async ({
  page,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });

  const origin = new URL(baseURL ?? 'http://localhost:3200').origin;
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) crossOrigin.push(request.url());
  });

  await page.goto('/legal/cookies');

  // Claim 1: "This website sets no cookies."
  expect(await page.evaluate(() => document.cookie)).toBe('');

  // Claim 2: "On first load nothing is written" — next-themes only READS storage at
  // init (verified against the installed 0.4.6 source; this assertion keeps the copy
  // honest across upgrades).
  expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([]);

  // Claim 3: "Only when you pick a theme with the toggle does the site write a single
  // localStorage entry" — the `theme` key, exactly.
  await page.getByRole('button', { name: 'Noon' }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual(['theme']);
  expect(await page.evaluate(() => window.localStorage.getItem('theme'))).toBe('light');

  // Claim 4: "Every request your browser makes for this page goes to the same origin."
  expect(crossOrigin).toEqual([]);
});
