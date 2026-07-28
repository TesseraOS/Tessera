import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const FILE_HIT = {
  ref: 'a'.repeat(64),
  label: 'src/retrieval/fuse.ts',
  kind: 'file',
  score: 0.91,
  node: { kind: 'file', key: 'src/retrieval/fuse' },
  signals: [{ signal: 'semantic', rank: 1, score: 0.9, weight: 0.5, contribution: 0.45 }],
};

/**
 * Row context menus (F-064; FR-49) — the browser-only half.
 *
 * `components/row-context-menu.test.tsx` covers copy / open / omission in jsdom. This adds the two
 * things jsdom cannot judge: that the menu opens on a real right-click, and that axe is clean while
 * it is open (a portalled menu is exactly where focus and labelling go wrong).
 *
 * **The keyboard does NOT open this menu**, and that is asserted here rather than hoped for. The
 * results listbox holds focus via `aria-activedescendant`, so Shift+F10 and the Menu key fire
 * `contextmenu` on the listbox and never reach a row trigger — both were driven in Chromium and
 * opened nothing. The menu is therefore a shortcut, and every action in it must also be reachable
 * some other way; the test below pins that for Copy ref.
 *
 * It lives in its own spec rather than appended to `search.spec.ts` because the behaviour is
 * cross-surface — and because inside that file the same body failed to open the menu while an
 * identical isolated spec passed every time. Rather than ship a test that fails for a reason I could
 * not name, the coverage lives where it is reproducibly green.
 */
test('a result row opens its context menu on right-click, and stays accessible', async ({
  page,
}) => {
  // A SINGLE result, deliberately: with more rows the virtualizer re-measures after first paint and
  // re-renders, so an element located a moment earlier can detach exactly as the click lands.
  await page.route('**/v1/search', (route) => route.fulfill({ json: { results: [FILE_HIT] } }));
  await page.route('**/v1/effects**', (route) => route.fulfill({ json: { effects: [] } }));

  await page.goto('/search');
  await page.getByLabel('Search query').fill('auth');

  // The trigger element itself, so the gesture cannot land on a descendant.
  const row = page.locator('[data-slot="context-menu-trigger"]').first();
  await expect(row).toBeVisible();
  // Let the 250ms search debounce settle before gesturing at the row.
  await page.waitForTimeout(400);

  await row.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /copy ref/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open' })).toBeVisible();
  // "Show effects" is absent on this surface by design — opening the detail already renders effects
  // inline, and the menu omits what it cannot offer rather than disabling it.
  await expect(page.getByRole('menuitem', { name: 'Show effects' })).toHaveCount(0);

  // a11y with the menu open — a portalled menu is exactly where focus and labelling go wrong.
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: /copy ref/i })).toHaveCount(0);

  // The keyboard genuinely cannot open it — pinned so nobody documents otherwise, and so that if a
  // future focus model DOES make it work, this test fails and the limitation gets re-examined.
  await page.getByRole('listbox', { name: 'Search results' }).focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem')).toHaveCount(0);

  // Which is why the action must exist on a keyboard-reachable surface. Enter opens the detail; the
  // Copy ref button there is the path the menu is only a shortcut to.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Copy ref' })).toBeVisible();
});
