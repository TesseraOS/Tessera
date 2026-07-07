import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('homepage renders the hero and passes axe WCAG AA', async ({ page }) => {
  // Steady-state scan: entrance animations are one-shot; scanning mid-fade would measure
  // blended colors. The kill-switch path IS the final layout (verified separately below).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  // Exactly one h1 (MARKETING-DESIGN §1.7), and it carries the positioning.
  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toContainText('Tessera');

  // The differentiator sections exist with accessible headings.
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What makes Tessera different' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('primary CTAs point at the app surface (env-driven, never hardcoded)', async ({ page }) => {
  await page.goto('/');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3100';
  const startFree = page.getByRole('link', { name: 'Start free' }).first();
  await expect(startFree).toHaveAttribute('href', appUrl);
});

test('no horizontal overflow at 375px (mobile)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('mobile nav opens, is keyboard-dismissable, and passes axe while open', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const toggle = page.getByRole('button', { name: 'Open menu' });
  await toggle.click();
  await expect(page.locator('#mobile-nav')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-nav')).toBeHidden();
});

test('SEO + agent-readable endpoints respond', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('<urlset');

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap:');

  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  const llmsText = await llms.text();
  expect(llmsText).toContain('# Tessera');
  expect(llmsText).toContain('compile_context');

  const og = await request.get('/opengraph-image');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toContain('image/png');
});

test('reduced motion: content is fully visible without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // rise-in elements must not be stuck invisible when animations are disabled.
  const ctaRow = page.getByRole('link', { name: 'Start free' }).first();
  await expect(ctaRow).toBeVisible();
  const opacity = await ctaRow.evaluate((el) => getComputedStyle(el.parentElement!).opacity);
  expect(Number(opacity)).toBe(1);
});
