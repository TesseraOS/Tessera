import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const contextPackage = {
  task: 'explain fusion',
  budget: 2000,
  totalTokens: 120,
  sections: [
    {
      title: 'code',
      fragments: [
        {
          ref: 'a'.repeat(64),
          text: 'export function fuse() {}',
          kind: 'code',
          tokens: 50,
          score: 0.84,
          provenance: {
            retrievalScore: 0.84,
            signals: ['semantic', 'keyword'],
            source: { path: 'src/retrieval/fuse.ts' },
          },
          whyIncluded: 'High semantic match for the task',
        },
      ],
    },
  ],
  trace: {
    stages: [
      { stage: 'retrieve', inputCount: 12, outputCount: 6, dropped: [] },
      {
        stage: 'dedup',
        inputCount: 6,
        outputCount: 4,
        dropped: [{ ref: 'src/retrieval/old.ts', reason: 'near-duplicate' }],
      },
    ],
  },
  scores: { fragmentCount: 1, budgetAdherence: 0.94, provenanceCoverage: 1, redundancy: 0.08 },
};

/** What an empty compile really returns: vacuously perfect scores over zero fragments. */
const emptyPackage = {
  task: 'explain fusion',
  budget: 2000,
  totalTokens: 0,
  sections: [],
  trace: { stages: [{ stage: 'retrieve', inputCount: 0, outputCount: 0, dropped: [] }] },
  scores: { fragmentCount: 0, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
};

// The app ships no mock data (ADR-0022); stub the API at the network boundary for the e2e.
async function stub(page: Page, options: { pkg?: unknown; stats?: unknown } = {}): Promise<void> {
  await page.route('**/v1/compile', (route) =>
    route.fulfill({ json: options.pkg ?? contextPackage }),
  );
  await page.route('**/v1/stats', (route) =>
    route.fulfill({
      json: options.stats ?? {
        documents: 128,
        memories: 4,
        graph: { nodes: 10, effectLinks: 2 },
        sources: 2,
        lastScanAt: null,
      },
    }),
  );
  await page.route('**/v1/events', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'retry: 100000\n\n' }),
  );
}

async function compile(page: Page, task = 'explain fusion'): Promise<void> {
  await page.goto('/inspector');
  await page.getByLabel('Task description').fill(task);
  await page.getByRole('button', { name: 'Compile' }).click();
}

test('inspector compiles and renders the package, trace, and passes a11y', async ({ page }) => {
  await stub(page);
  await compile(page);

  await expect(page.getByText('High semantic match for the task')).toBeVisible();
  await expect(page.getByText('Compilation trace')).toBeVisible();
  await expect(page.getByText(/near-duplicate/)).toBeVisible();
  // The citation is the real path — the Inspector had F-073's disease after /search was cured of it.
  await expect(page.getByText('src/retrieval/fuse.ts').first()).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('an empty package shows guidance, not three full score bars', async ({ page }) => {
  await stub(page, {
    pkg: emptyPackage,
    stats: {
      documents: 0,
      memories: 0,
      graph: { nodes: 0, effectLinks: 0 },
      sources: 0,
      lastScanAt: null,
    },
  });
  await compile(page);

  // The 2026-07-04 review saw "Budget adherence 100% · Provenance coverage 100% · 0 fragments" —
  // a vacuous truth rendered as an achievement.
  await expect(page.getByText('No sources are connected')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByText('100%')).toBeHidden();
  await expect(page.getByRole('link', { name: /connect a source/i })).toBeVisible();
});

test('the guidance state passes a11y', async ({ page }) => {
  await stub(page, { pkg: emptyPackage });
  await compile(page);
  await expect(page.getByText(/matched nothing/i)).toBeVisible();

  // F-061 shipped a CRITICAL axe violation that only an empty state could reveal, because its own
  // axe test always had results. This feature's whole subject IS an empty state — audit it.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('exports the package as citation-preserving Markdown', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await stub(page);
  await compile(page);
  await expect(page.getByText('Package scores')).toBeVisible();

  await page.getByRole('button', { name: /copy as markdown/i }).click();
  await expect(page.getByRole('button', { name: /^copied$/i })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('# Context: explain fusion');
  // Citation-preserving means the citation is usable: a path an agent can open, not a sha256.
  expect(copied).toContain('### src/retrieval/fuse.ts');
  expect(copied).toContain('**Why included:** High semantic match for the task');
});

test('budget presets set the budget without replacing the input', async ({ page }) => {
  await stub(page);
  await page.goto('/inspector');

  const budget = page.getByLabel('Token budget');
  await expect(budget).toHaveValue('2000');

  await page
    .getByRole('group', { name: 'Budget presets' })
    .getByRole('button', { name: '8,000' })
    .click();
  await expect(budget).toHaveValue('8000');

  // The labelled numeric input must stay fillable — tests/e2e-full drives it against a live server.
  await budget.fill('4000');
  await expect(budget).toHaveValue('4000');
});

test('says when the plan capped the compile', async ({ page }) => {
  await stub(page, { pkg: { ...contextPackage, budget: 8000 } });
  await page.goto('/inspector');
  await page.getByLabel('Task description').fill('explain fusion');
  await page.getByLabel('Token budget').fill('20000');
  await page.getByRole('button', { name: 'Compile' }).click();

  const notice = page.getByRole('status');
  await expect(notice).toContainText('8,000');
  await expect(notice).toContainText('20,000');
});

test('kind filters reach the API and a session history re-runs a task', async ({ page }) => {
  await stub(page);
  const bodies: string[] = [];
  // Registered AFTER stub() on purpose: Playwright matches routes in reverse registration order, so
  // the last handler for a pattern wins. Registering this first would let stub's compile route
  // shadow it and the capture would stay empty.
  await page.route('**/v1/compile', (route) => {
    bodies.push(route.request().postData() ?? '');
    return route.fulfill({ json: contextPackage });
  });
  await page.goto('/inspector');

  await page.getByLabel('Task description').fill('explain fusion');
  await page
    .getByRole('group', { name: 'Restrict to kinds' })
    .getByRole('button', { name: 'memory' })
    .click();
  await page.getByRole('button', { name: 'Compile' }).click();
  await expect(page.getByText('Package scores')).toBeVisible();

  expect(bodies[0]).toContain('"kinds":["memory"]');

  // The task is remembered and re-runnable — session-local, and the copy says so.
  const recents = page.getByRole('list', { name: 'Recent compiles' });
  await expect(recents.getByText('explain fusion')).toBeVisible();
  await recents.getByRole('button', { name: /explain fusion/ }).click();
  await expect.poll(() => bodies.length).toBeGreaterThan(1);
});
