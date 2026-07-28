import { expect, test } from './support/fixtures';

/**
 * Palette primary actions (F-064; FR-49).
 *
 * The unit tests prove the palette leaves a request and calls `router.push`. What only a browser can
 * prove is that the request SURVIVES the navigation and the destination view actually opens its
 * dialog — the entire reason the request exists rather than a direct call.
 */
test('⌘K → Capture memory navigates and opens the dialog on arrival', async ({ page }) => {
  await page.route('**/v1/memory**', (route) => route.fulfill({ json: { memories: [] } }));
  // Start somewhere else on purpose: the point is that the action works from a page that knows
  // nothing about memory.
  await page.goto('/settings');
  await expect(page.getByText('Appearance')).toBeVisible();

  const palette = page.getByRole('dialog');
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  await page.getByRole('option', { name: 'Capture memory' }).click();

  await expect(page).toHaveURL(/\/memory$/);
  // The dialog the request asked for — this is the assertion the whole mechanism exists to satisfy.
  await expect(page.getByRole('dialog', { name: /capture memory/i })).toBeVisible();
});

test('the request is one-shot — leaving and returning does not re-open it', async ({ page }) => {
  await page.route('**/v1/memory**', (route) => route.fulfill({ json: { memories: [] } }));
  await page.route('**/v1/sources**', (route) => route.fulfill({ json: { sources: [] } }));
  await page.goto('/settings');
  await expect(page.getByText('Appearance')).toBeVisible();

  const palette = page.getByRole('dialog');
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('option', { name: 'Capture memory' }).click();

  const captureDialog = page.getByRole('dialog', { name: /capture memory/i });
  await expect(captureDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(captureDialog).toBeHidden();

  // Navigate away and back. A request that survived would ambush the user here.
  await page.goto('/sources');
  await page.goto('/memory');
  await expect(captureDialog).toHaveCount(0);
});
