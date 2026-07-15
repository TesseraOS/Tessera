import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

test.describe('Dashboard shell', () => {
  test('renders the overview with sidebar navigation', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Overview' }).first()).toBeVisible();
    await expect(page.getByText('Indexed documents')).toBeVisible();
  });

  test('opens the command palette with the keyboard', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByPlaceholder('Search or jump to…')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Search or jump to…')).toBeHidden();
  });

  test('has no detectable WCAG A/AA accessibility violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
