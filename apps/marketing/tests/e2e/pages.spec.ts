import AxeBuilder from '@axe-core/playwright';
import { PLAN_IDS, PLANS } from '@tessera/billing';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** The F-051 subpages (ADR-0045 v4.4) + F-067 legal routes (v4.9) — h1 fragments
 * identify each page's statement. Legal routes inherit the whole battery: one h1,
 * axe AA on both themes, 375px no-overflow, sitemap + llms.txt listing. */
const PAGES = [
  { path: '/features', h1: 'Everything your agents forget' },
  { path: '/pricing', h1: 'Free where your code' },
  { path: '/enterprise', h1: 'Context your security team' },
  { path: '/skills', h1: 'Teach your agents' },
  { path: '/legal/privacy', h1: 'Privacy policy' },
  { path: '/legal/terms', h1: 'Terms of service' },
  { path: '/legal/cookies', h1: 'Cookie policy' },
  { path: '/legal/imprint', h1: 'Imprint' },
] as const;

for (const { path, h1 } of PAGES) {
  test(`${path} has one h1 and passes axe AA on both themes`, async ({ page }) => {
    // Steady-state scan (see home.spec.ts): reduced motion is the final layout.
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto(path);

    const heading = page.locator('h1');
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText(h1);

    const dusk = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(dusk.violations).toEqual([]);

    // Switch to noon via the footer toggle (the user path, not a class hack) and re-scan.
    await page.getByRole('button', { name: 'Noon' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    const noon = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(noon.violations).toEqual([]);
  });

  test(`${path} has no horizontal overflow at 375px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('pricing renders the @tessera/billing PLANS catalog, not hand-copied numbers', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/pricing');

  // Scope to the plans section — plan names like "Enterprise" also appear in the nav.
  const plansSection = page.locator('#plans');

  for (const id of PLAN_IDS) {
    const plan = PLANS[id];
    // Plan card titles are the catalog names (uppercased by CSS, so match text content).
    await expect(plansSection.getByText(plan.name, { exact: true })).toBeVisible();

    if (plan.priceCents > 0) {
      await expect(
        plansSection.getByText(`$${plan.priceCents / 100}`, { exact: true }),
      ).toBeVisible();
    }

    const { maxMonthlyCompiles, maxSeats, maxTokensPerCompile } = plan.entitlements;
    await expect(
      plansSection.getByText(
        maxMonthlyCompiles < 0
          ? 'Unlimited compiles'
          : `${maxMonthlyCompiles.toLocaleString('en-US')} compiles per month`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      plansSection.getByText(maxSeats < 0 ? 'Unlimited seats' : new RegExp(`^${maxSeats} seats?$`)),
    ).toBeVisible();
    await expect(
      plansSection.getByText(
        maxTokensPerCompile < 0
          ? 'Unbounded compile budget'
          : `${maxTokensPerCompile.toLocaleString('en-US')}-token compile budget`,
        { exact: true },
      ),
    ).toBeVisible();
  }

  // The contact-sales tier never masquerades as free (catalog: priceCents 0 ≠ $0 here).
  await expect(plansSection.getByText('Custom', { exact: true })).toBeVisible();
});

test('pricing FAQ discloses natively (details/summary, no JS)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/pricing');

  const answer = page.getByText('Compile budgets clamp to the plan ceiling', { exact: false });
  await expect(answer).toBeHidden();
  await page.getByText('What happens when I hit a plan limit?').click();
  await expect(answer).toBeVisible();
});

test('sitemap and llms.txt list every page', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  for (const { path } of PAGES) {
    expect(sitemapText).toContain(path);
  }

  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  const llmsText = await llms.text();
  for (const { path } of PAGES) {
    expect(llmsText).toContain(path);
  }
});
