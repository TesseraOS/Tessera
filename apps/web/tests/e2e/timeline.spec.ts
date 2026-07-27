import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

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

/**
 * The windowing claim, asserted where there IS layout (F-064; FR-49).
 *
 * The unit test cannot make this claim: jsdom has no layout, so the real virtualizer measures a
 * 0-height viewport and renders nothing, which is why `timeline-view.test.tsx` stubs it. A test that
 * only checks "a row is visible" stays green with virtualization deleted — a list that renders
 * everything renders the first row too. So this feeds it 500 entries and counts the DOM.
 */
test('the timeline virtualizes: 500 entries do not become 500 rows, and axe still passes', async ({
  page,
}) => {
  const memories = Array.from({ length: 500 }, (_, index) => ({
    id: `m${String(index)}`,
    lineageId: `l${String(index)}`,
    kind: 'decision',
    title: `Decision number ${String(index)}`,
    body: 'because…',
    scope: 'api',
    confidence: 1,
    metadata: {},
    version: 1,
    supersedes: null,
    supersededBy: null,
    // Descending seconds so the feed has a stable, distinct order.
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));

  await page.route('**/v1/memory', async (route) => route.fulfill({ json: { memories } }));
  await page.route('**/v1/audit*', async (route) => route.fulfill({ json: { events: [] } }));
  await page.route('**/v1/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'retry: 100000\n\n',
    });
  });

  await page.goto('/timeline');

  // Scope through the labelled scroll region — the app shell's sidebar contributes several lists.
  const region = page.getByRole('region', { name: 'Activity timeline' });
  await expect(region).toBeVisible();
  const list = region.getByRole('list');

  const rendered = await list.getByRole('listitem').count();
  expect(rendered).toBeGreaterThan(0);
  // Generous bound: the exact window depends on viewport height and measured row heights. What must
  // hold is that it is a WINDOW — deleting the virtualizer makes this 500.
  expect(rendered).toBeLessThan(100);

  // a11y with the virtualized list populated: absolute positioning blockifies the <li>, so the
  // list/listitem roles are declared explicitly and this is what proves they survived.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});
