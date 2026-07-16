import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const FILE_HIT = {
  ref: 'a'.repeat(64),
  label: 'src/retrieval/fuse.ts',
  kind: 'file',
  score: 0.91,
  node: { kind: 'file', key: 'src/retrieval/fuse' },
  snippet: {
    text: 'export function fuse(results) { return ranked; }',
    matches: [{ start: 16, end: 20 }],
    truncatedStart: false,
    truncatedEnd: true,
  },
  signals: [
    { signal: 'semantic', rank: 1, score: 0.9, weight: 0.5, contribution: 0.45 },
    { signal: 'keyword', rank: 2, score: 0.7, weight: 0.3, contribution: 0.21 },
  ],
};

const MEMORY_HIT = {
  ref: 'memory/lineage-1',
  label: 'Adopt reciprocal-rank fusion',
  kind: 'memory',
  score: 0.4,
  signals: [{ signal: 'keyword', rank: 3, score: 0.4, weight: 0.3, contribution: 0.09 }],
};

// The app ships no mock data (ADR-0022); stub the API at the network boundary for the e2e.
async function stubSearch(page: Page, results: unknown[] = [FILE_HIT, MEMORY_HIT]): Promise<void> {
  await page.route('**/v1/search', (route) => route.fulfill({ json: { results } }));
  await page.route('**/v1/effects**', (route) => route.fulfill({ json: { effects: [] } }));
}

test('the empty search page passes a11y (no dangling ARIA references)', async ({ page }) => {
  await stubSearch(page);
  await page.goto('/search');
  await expect(page.getByText('Search across everything')).toBeVisible();

  // The results listbox does not exist until there are results, so nothing may reference it. An
  // ARIA attribute pointing at a missing element is a CRITICAL violation, and auditing only the
  // populated page misses it entirely — which is exactly how it shipped past the first review.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('a no-results search passes a11y', async ({ page }) => {
  await stubSearch(page, []);
  await page.goto('/search');
  await page.getByLabel('Search query').fill('nothingmatchesthis');
  await expect(page.getByText('No results')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('results are labelled, excerpted, and provenance-tagged — and pass a11y', async ({ page }) => {
  await stubSearch(page);
  await page.goto('/search');
  await page.getByLabel('Search query').fill('fusion');

  // Labelled by path, not by the 64-char content hash that shipped before F-061/F-073.
  await expect(page.getByText('src/retrieval/fuse.ts')).toBeVisible();
  await expect(page.getByText('semantic')).toBeVisible();

  // The excerpt renders with the matched term marked.
  await expect(page.locator('mark')).toHaveText('fuse');

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('kind filters count within the current results', async ({ page }) => {
  await stubSearch(page);
  await page.goto('/search');
  await page.getByLabel('Search query').fill('fusion');
  await expect(page.getByText('src/retrieval/fuse.ts')).toBeVisible();

  await expect(page.getByText('2 results for this query')).toBeVisible();

  // Scoped to the filter group — the sidebar's "New memory" button also matches /memory/i.
  const filters = page.getByRole('group', { name: 'Filter results by kind' });
  await expect(filters.getByRole('button', { name: /file/i })).toContainText('1');
  await expect(filters.getByRole('button', { name: /memory/i })).toContainText('1');
  // A kind absent from these results is offered but inert, never implying the corpus has none.
  await expect(filters.getByRole('button', { name: /symbol/i })).toBeDisabled();

  // Filtering to memories leaves only the memory hit.
  await filters.getByRole('button', { name: /memory/i }).click();
  await expect(page.getByText('Adopt reciprocal-rank fusion')).toBeVisible();
  await expect(page.getByText('src/retrieval/fuse.ts')).toBeHidden();
});

test('keyboard: arrows move, Enter opens the detail, Escape returns to the list', async ({
  page,
}) => {
  await stubSearch(page);
  await page.goto('/search');
  await page.getByLabel('Search query').fill('fusion');
  await expect(page.getByText('src/retrieval/fuse.ts')).toBeVisible();

  // ↓ from the input hands off to the list, so the keyboard path is continuous.
  await page.getByLabel('Search query').press('ArrowDown');
  const listbox = page.getByRole('listbox', { name: 'Search results' });
  await expect(listbox).toBeFocused();

  await listbox.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  // Provenance is readable without a mouse — the whole point of the detail surface.
  await expect(sheet.getByText('Why this ranked')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(listbox).toBeFocused();
});

test('the detail surface wires search → compile → effects', async ({ page }) => {
  await stubSearch(page, [FILE_HIT]);
  await page.goto('/search');
  await page.getByLabel('Search query').fill('fusion');
  await page.getByText('src/retrieval/fuse.ts').click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();

  // "Show effects" is reachable only because the API supplies the graph node — GET /v1/effects is
  // keyed by {kind,key}, and a file's key IS its path (F-073's payload).
  await expect(sheet.getByText(/what a change here affects/i)).toBeVisible();

  // The Inspector seed carries the query AND the label, never the hash.
  await expect(sheet.getByRole('link', { name: /open in inspector/i })).toHaveAttribute(
    'href',
    `/inspector?task=${encodeURIComponent('fusion — src/retrieval/fuse.ts')}`,
  );
});

test('the detail Sheet passes a11y with it open', async ({ page }) => {
  await stubSearch(page);
  await page.goto('/search');
  await page.getByLabel('Search query').fill('fusion');
  await page.getByText('src/retrieval/fuse.ts').click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // The Sheet is new a11y surface — auditing only the list would miss it entirely.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('the Inspector prefills from the seed and does not auto-compile', async ({ page }) => {
  let compiled = false;
  await page.route('**/v1/compile', (route) => {
    compiled = true;
    return route.fulfill({ json: { task: 't', budget: 2000, totalTokens: 0, sections: [] } });
  });

  await page.goto(`/inspector?task=${encodeURIComponent('fusion — src/retrieval/fuse.ts')}`);

  await expect(page.getByLabel('Task description')).toHaveValue('fusion — src/retrieval/fuse.ts');
  // Compile spends budget and is entitlement-clamped — it must never fire from a navigation.
  expect(compiled).toBe(false);
});
