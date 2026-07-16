import AxeBuilder from '@axe-core/playwright';
// Real token-mode flow (no Local-identity stub) — imports @playwright/test directly like auth.spec.
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TOKEN_API = 'http://127.0.0.1:3000';

test.describe('account & profile — token mode against a real server (F-046)', () => {
  test('renders identity/access/plan and issues a token in the UI that then authenticates', async ({
    page,
    request,
  }) => {
    // Sign in as the tenant owner.
    const { token } = (await (await request.get(`${TOKEN_API}/e2e/token`)).json()) as {
      token: string;
    };
    await page.goto('/signin');
    await page.getByLabel('API token').fill(token);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/signin/);

    await page.goto('/profile');

    // Identity + access, all API-backed (no fake data).
    await expect(page.getByRole('heading', { name: 'E2E User' })).toBeVisible();
    await expect(page.getByText('acme').first()).toBeVisible();
    await expect(page.getByText('admin:manage')).toBeVisible();
    await expect(page.getByText('Plan & usage')).toBeVisible();

    // The resting profile is accessible.
    const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(axe.violations).toEqual([]);

    // Issue a token in the UI.
    await page.getByRole('button', { name: 'Create token' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Principal id').fill('e2e-issued');
    await dialog.getByRole('button', { name: 'Create token' }).click();

    // The secret is revealed exactly once — capture it.
    const secretCode = dialog.locator('code');
    await expect(secretCode).toBeVisible();
    const secret = ((await secretCode.textContent()) ?? '').trim();
    expect(secret).toMatch(/^tsk_/);

    // The issued secret authenticates directly against the real API as the new principal.
    const me = await request.get(`${TOKEN_API}/v1/me`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(me.ok()).toBeTruthy();
    expect(((await me.json()) as { principal: { id: string } }).principal.id).toBe('e2e-issued');

    // The new token appears in the list after closing the reveal.
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('e2e-issued').first()).toBeVisible();
  });
});
