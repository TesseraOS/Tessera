import { expect, test } from '@playwright/test';

/**
 * F-067 truth checks — the legal pages' claims, executed against the production build.
 * pages.spec.ts already covers h1/axe/overflow/sitemap/llms for these routes; this
 * spec proves the surface-specific facts: routes resolve, the footer legal nav exists,
 * placeholders cannot silently vanish, each hero carries its signature art + the
 * preliminary badge (v2, ADR-0045 v4.10), and the cookie policy's storage claims are
 * literally true (see lib/legal/cookies.ts — wording and assertions move together).
 */

const LEGAL_ROUTES = [
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  '/legal/gdpr',
  '/legal/imprint',
];

/** Each legal hero's signature art, identified by a fragment of its role=img label. */
const HERO_ARTS = [
  { route: '/legal/privacy', art: /redaction gate/i },
  { route: '/legal/terms', art: /two covenants/i },
  { route: '/legal/cookies', art: /storage shelf/i },
  { route: '/legal/gdpr', art: /rights model/i },
  { route: '/legal/imprint', art: /nameplate/i },
] as const;

test('every legal route responds 200', async ({ page }) => {
  for (const route of LEGAL_ROUTES) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} must resolve`).toBe(200);
  }
});

test('the footer exposes a legal nav whose five links resolve', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const legalNav = page.getByRole('navigation', { name: 'legal' });
  await expect(legalNav).toBeVisible();
  for (const route of LEGAL_ROUTES) {
    await expect(legalNav.locator(`a[href="${route}"]`)).toHaveCount(1);
  }
});

for (const route of ['/legal/privacy', '/legal/gdpr', '/legal/imprint']) {
  test(`${route} renders visible counsel-review placeholders`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);

    const callouts = page.getByRole('note', { name: 'Pending counsel review' });
    expect(await callouts.count()).toBeGreaterThanOrEqual(1);
    await expect(callouts.first()).toBeVisible();
  });
}

for (const { route, art } of HERO_ARTS) {
  test(`${route} hero carries its signature art and the preliminary badge`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);

    // The art exposes itself as a labelled image (decorative-interactive contract).
    await expect(page.getByRole('img', { name: art })).toBeVisible();
    // The softened status badge (v2 wording) sits in the hero.
    await expect(page.getByText('preliminary — final on incorporation')).toBeVisible();
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
