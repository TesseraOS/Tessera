import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The app ships no mock data (ADR-0022); stub the sources API at the network boundary for the e2e.
test('sources list renders, register dialog validates, and passes a11y', async ({ page }) => {
  await page.route('**/v1/sources', async (route) => {
    await route.fulfill({
      json: {
        sources: [
          {
            id: 's1',
            kind: 'filesystem',
            label: 'Backend monorepo',
            config: { root: '/srv/app' },
            createdAt: '2026-07-06T10:00:00.000Z',
          },
        ],
      },
    });
  });
  await page.route('**/v1/sources/*/scan', async (route) => {
    await route.fulfill({ json: { state: 'idle' } });
  });
  // Inert SSE stream with a long reconnect hint so EventSource does not reconnect during the test.
  await page.route('**/v1/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'retry: 100000\n\n: connected\n\n',
    });
  });

  await page.goto('/sources');

  await expect(page.getByText('Backend monorepo')).toBeVisible();
  await expect(page.getByText('/srv/app')).toBeVisible();

  // The register dialog opens with a connector-specific, validated path field.
  await page.getByRole('button', { name: 'Register source' }).click();
  await expect(page.getByRole('dialog').getByText('Register a source')).toBeVisible();
  await expect(page.getByLabel('Directory path')).toBeVisible();
  await page.keyboard.press('Escape');

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('sources shows an empty state when nothing is registered', async ({ page }) => {
  await page.route('**/v1/sources', async (route) => route.fulfill({ json: { sources: [] } }));
  await page.route('**/v1/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'retry: 100000\n\n',
    });
  });

  await page.goto('/sources');

  await expect(page.getByText('No sources yet')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
