import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Tess, the brand mascot (F-066, ADR-0046) — the three usage-budget placements:
 * the 404 page (lost), the mobile-menu ground (greeting), and the constellation
 * supervisor (watching). Decorative semantics, both themes, reduced-motion stillness.
 */

test('404: an unknown route serves the not-found statement with Tess lost (dusk axe)', async ({
  page,
}) => {
  // The document request itself logs "Failed to load resource: 404" — inherent to a 404
  // page. Everything else (React/hydration errors above all) must stay silent.
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/404 \(Not Found\)/.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });

  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  const response = await page.goto('/this-tile-does-not-exist');
  expect(response?.status()).toBe(404);

  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toContainText('A tile is');

  const tess = page.locator('[data-tess]');
  await expect(tess).toBeVisible();
  await expect(tess).toHaveAttribute('data-mood', 'lost');
  await expect(tess).toHaveAttribute('aria-hidden', 'true');

  await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
  expect(consoleErrors, 'zero console/hydration errors on the 404').toEqual([]);
});

test('404 passes axe on the light theme and never overflows at 375px', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/this-tile-does-not-exist');
  await expect(page.locator('html')).toHaveClass(/light/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('mobile menu: Tess greets from the mosaic ground, decorative, single gold moment', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();

  const tess = menu.locator('[data-tess]');
  await expect(tess).toBeVisible();
  await expect(tess).toHaveAttribute('data-mood', 'greeting');
  await expect(tess).toHaveAttribute('aria-hidden', 'true');

  // The accent interaction (§4.1): Tess's heart owns the menu's gold moment, so the
  // mosaic ground must not render its own arriving ember tile.
  await expect(menu.locator('.tile-arrive')).toHaveCount(0);
});

test('constellation supervisor: Tess watches from the telemetry island and is disclosed', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto('/');

  const band = page.locator('#graph');
  const tess = band.locator('[data-tess]');
  await expect(tess).toBeVisible();
  // Reduced motion freezes the telemetry at its seed — the supervisor holds `watching`.
  await expect(tess).toHaveAttribute('data-mood', 'watching');
  await expect(tess).toHaveAttribute('aria-hidden', 'true');

  // Tess never carries information alone: the sr alternative names it and the island
  // renders the telemetry as text.
  await expect(band.locator('.sr-only').last()).toContainText('Tess');
  await expect(band.getByText('tokens')).toBeVisible();
});

test('reduced motion: every Tess animation is off — the pose is the still frame', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto('/this-tile-does-not-exist');

  // The package's reduce block sets animation: none (the app's global kill-switch also
  // clamps durations) — animation-name is the invariant that proves total stillness.
  const animations = await page
    .locator('[data-tess]')
    .evaluate((svg) =>
      ['.tess-ember', '.tess-drift', '.tess-slot'].map((selector) =>
        svg.querySelector(selector)
          ? getComputedStyle(svg.querySelector(selector) as Element).animationName
          : 'missing',
      ),
    );
  expect(animations).toEqual(['none', 'none', 'none']);
});
