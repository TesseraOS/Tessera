import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const CURRENT = {
  id: 'v2',
  lineageId: 'l1',
  kind: 'decision',
  title: 'Chose Fastify over Express',
  body: 'Fastify has first-class schema validation and better throughput.',
  scope: 'api',
  confidence: 1,
  metadata: { source: 'adr:0016', tags: ['api', 'framework'] },
  version: 2,
  supersedes: 'v1',
  supersededBy: null,
  createdAt: '2026-07-02T10:00:00.000Z',
};

// The app ships no mock data (ADR-0022); stub the memory API at the network boundary for the e2e.
test('memory browser lists, opens a lineage with version history, and passes a11y', async ({
  page,
}) => {
  await page.route('**/v1/memory', async (route) => {
    await route.fulfill({ json: { memories: [CURRENT] } });
  });
  await page.route('**/v1/memory/*/history', async (route) => {
    await route.fulfill({
      json: {
        versions: [
          { ...CURRENT, id: 'v1', title: 'First take', version: 1, supersededBy: 'v2' },
          CURRENT,
        ],
      },
    });
  });

  await page.goto('/memory');

  await expect(page.getByText('Chose Fastify over Express').first()).toBeVisible();

  // Open the lineage → the detail sheet shows the immutable version history.
  await page.getByText('Chose Fastify over Express').first().click();
  await expect(page.getByText('Version history')).toBeVisible();
  await expect(page.getByText('First take')).toBeVisible();
  await expect(page.getByText('current')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('memory shows an empty state when there are no memories', async ({ page }) => {
  await page.route('**/v1/memory', async (route) => route.fulfill({ json: { memories: [] } }));

  await page.goto('/memory');

  await expect(page.getByText('No memories yet')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
