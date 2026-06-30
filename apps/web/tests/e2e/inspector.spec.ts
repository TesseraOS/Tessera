import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const contextPackage = {
  task: 'explain fusion',
  budget: 2000,
  totalTokens: 120,
  sections: [
    {
      title: 'Code',
      fragments: [
        {
          ref: 'src/retrieval/fuse.ts',
          text: 'export function fuse() {}',
          kind: 'code',
          tokens: 50,
          score: 0.84,
          provenance: { retrievalScore: 0.84, signals: ['semantic', 'keyword'] },
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

// The app ships no mock data (ADR-0022); we stub the API at the network boundary for the e2e.
test('inspector compiles and renders the package, trace, and passes a11y', async ({ page }) => {
  await page.route('**/v1/compile', async (route) => {
    await route.fulfill({ json: contextPackage });
  });

  await page.goto('/inspector');
  await page.getByLabel('Task').fill('explain fusion');
  await page.getByRole('button', { name: 'Compile' }).click();

  await expect(page.getByText('High semantic match for the task')).toBeVisible();
  await expect(page.getByText('Compilation trace')).toBeVisible();
  await expect(page.getByText(/near-duplicate/)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
