import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The app ships no mock data (ADR-0022); we stub the audit API at the network boundary for the e2e.
test('audit log renders events with outcomes, filters, and passes a11y', async ({ page }) => {
  await page.route('**/v1/audit*', async (route) => {
    await route.fulfill({
      json: {
        events: [
          {
            id: 'a1',
            tenantId: 'default',
            actor: { principalId: 'writer-1', kind: 'token' },
            action: 'memory.write',
            target: 'lin-42',
            outcome: 'success',
            at: '2026-07-04T10:00:00.000Z',
          },
          {
            id: 'a2',
            tenantId: 'default',
            actor: { principalId: 'reader-1', kind: 'token' },
            action: 'memory.write',
            target: 'lin-42',
            outcome: 'denied',
            at: '2026-07-04T09:59:00.000Z',
          },
        ],
      },
    });
  });

  await page.goto('/audit');

  await expect(page.getByText('writer-1')).toBeVisible();
  await expect(page.getByText('denied')).toBeVisible();
  await expect(page.getByLabel('Filter by action')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('governance shows the roles matrix + retention and passes a11y', async ({ page }) => {
  await page.goto('/governance');

  await expect(page.getByText('Roles & permissions')).toBeVisible();
  await expect(page.getByText('admin:manage')).toBeVisible();
  await expect(page.getByText('Audit retention')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
