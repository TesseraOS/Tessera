import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The app ships no mock data (ADR-0022); stub memory + audit + an inert event stream.
test('timeline merges memory + audit into a time-ordered feed and passes a11y', async ({
  page,
}) => {
  await page.route('**/v1/memory', async (route) => {
    await route.fulfill({
      json: {
        memories: [
          {
            id: 'm1',
            lineageId: 'l1',
            kind: 'decision',
            title: 'Chose Fastify over Express',
            body: 'because…',
            scope: 'api',
            confidence: 1,
            metadata: {},
            version: 1,
            supersedes: null,
            supersededBy: null,
            createdAt: '2026-07-01T10:00:00.000Z',
          },
        ],
      },
    });
  });
  await page.route('**/v1/audit*', async (route) => {
    await route.fulfill({
      json: {
        events: [
          {
            id: 'a1',
            tenantId: 'default',
            actor: { principalId: 'writer', kind: 'token' },
            action: 'memory.write',
            target: 'l1',
            outcome: 'success',
            at: '2026-07-02T10:00:00.000Z',
          },
        ],
      },
    });
  });
  await page.route('**/v1/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'retry: 100000\n\n',
    });
  });

  await page.goto('/timeline');

  await expect(page.getByText('Chose Fastify over Express')).toBeVisible();
  await expect(page.getByText('Memory write')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
