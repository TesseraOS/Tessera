import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const GRAPH = {
  nodes: [
    { id: 'f1', kind: 'file', key: 'app.ts', label: 'app.ts', metadata: {} },
    { id: 'f2', kind: 'file', key: 'util.ts', label: 'util.ts', metadata: {} },
  ],
  edges: [
    {
      id: 'e1',
      from: 'f1',
      to: 'f2',
      kind: 'imports',
      rationale: null,
      confidence: null,
      origin: null,
      metadata: {},
    },
  ],
};

// The app ships no mock data (ADR-0022); stub the graph + effects APIs for the e2e.
test('graph explorer renders, search selects a node, and passes a11y', async ({ page }) => {
  await page.route('**/v1/graph*', async (route) => route.fulfill({ json: GRAPH }));
  await page.route('**/v1/effects*', async (route) => route.fulfill({ json: { effects: [] } }));

  await page.goto('/graph');

  await expect(page.getByText('2 nodes · 1 edges')).toBeVisible();
  await expect(page.getByRole('tab', { name: /explore/i })).toBeVisible();

  // Search-to-focus: find a node and open its detail panel (the keyboard-accessible alternative).
  await page.getByLabel('Search nodes').fill('util');
  await page.getByRole('button', { name: /util\.ts/ }).click();
  await expect(page.getByText(/Connections/)).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
