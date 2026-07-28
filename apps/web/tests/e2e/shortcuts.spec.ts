import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The keyboard-shortcuts overlay (F-064; FR-49).
 *
 * The catalog itself is unit-tested; what only a browser can settle is whether `?` reaches a global
 * listener at all, and whether the guard against firing mid-typing actually holds when a real caret
 * is in a real input.
 */
test('? opens the shortcuts overlay, and it passes a11y', async ({ page }) => {
  await page.goto('/settings');
  // Appearance renders from client state alone, so it does not depend on any stubbed API call.
  await expect(page.getByText('Appearance')).toBeVisible();

  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  // Retry the keypress, not just the assertion: the listener is attached on hydration, and a '?'
  // delivered a moment too early is simply swallowed — which showed up as a first-attempt flake.
  await expect(async () => {
    await page.keyboard.press('?');
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  // Derived from the catalog, so this also proves the catalog reached the DOM.
  await expect(dialog.getByText('Open the command palette')).toBeVisible();
  await expect(dialog.getByText('Move to the next result')).toBeVisible();
  // The scope line — why a key that does nothing here is not broken.
  await expect(dialog.getByText('While the results list has focus')).toBeVisible();

  // Wait for the open animation to FINISH before auditing. axe measures computed colour, and during
  // the dialog's fade-in every element behind the overlay is sampled through a partially-transparent
  // layer — that produced 727 spurious color-contrast violations across the whole page, which then
  // vanished on retry and looked like flakiness.
  await page.evaluate(async () => {
    // A cancelled animation rejects with AbortError; cancelled IS settled for this purpose.
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('? does NOT open the overlay while typing into a field', async ({ page }) => {
  await page.route('**/v1/search', (route) => route.fulfill({ json: { results: [] } }));
  await page.goto('/search');

  const input = page.getByLabel('Search query');
  await input.click();
  await input.type('why? because');

  // `?` is a printable character. Without the typing guard this dialog would open mid-word — and the
  // character would be swallowed, which is the more annoying half of the bug.
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  await expect(input).toHaveValue('why? because');
});
