import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

// The app ships no mock data (ADR-0022); we stub the API at the network boundary for the e2e.
test('search shows provenance-tagged results and passes a11y', async ({ page }) => {
  await page.route('**/v1/search', async (route) => {
    await route.fulfill({
      json: {
        results: [
          {
            ref: 'src/retrieval/fuse.ts',
            label: 'fuse()',
            score: 0.91,
            signals: [
              { signal: 'semantic', rank: 1, score: 0.9, weight: 0.5, contribution: 0.45 },
              { signal: 'keyword', rank: 2, score: 0.7, weight: 0.3, contribution: 0.21 },
            ],
          },
        ],
      },
    });
  });

  await page.goto('/search');
  await page.getByLabel('Search query').fill('fusion');

  await expect(page.getByText('fuse()')).toBeVisible();
  await expect(page.getByText('semantic')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
