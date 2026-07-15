import AxeBuilder from '@axe-core/playwright';
// Note: this spec drives the REAL token-mode server (no session stub) — it imports @playwright/test
// directly rather than the Local-identity fixture the view specs use.
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TOKEN_API = 'http://127.0.0.1:3000';

test.describe('dashboard auth — token mode against a real server (F-045)', () => {
  test('redirects when unauthenticated, rejects a bad token, signs in and out', async ({
    page,
    request,
  }) => {
    // 1. Visiting a protected page unauthenticated → redirected to sign-in with the return path.
    await page.goto('/search');
    await expect(page).toHaveURL(/\/signin\?return=%2Fsearch/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    // Sign-in page is accessible.
    const signinAxe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(signinAxe.violations).toEqual([]);

    // 2. An invalid token is rejected with a visible error.
    await page.getByLabel('API token').fill('not-a-valid-token');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('#token-error')).toBeVisible();
    await expect(page).toHaveURL(/\/signin/);

    // 3. A valid token (issued by the real server) signs in and returns to the requested page.
    const tokenRes = await request.get(`${TOKEN_API}/e2e/token`);
    const { token } = (await tokenRes.json()) as { token: string };
    await page.getByLabel('API token').fill(token);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/search$/);

    // The authenticated shell is accessible (scan before opening any menu overlay).
    const shellAxe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(shellAxe.violations).toEqual([]);

    // Identity + tenant are shown in the account menu.
    await page.getByRole('button', { name: 'Account' }).click();
    await expect(page.getByText('E2E User')).toBeVisible();
    await expect(page.getByText(/acme/)).toBeVisible();

    // 4. Sign out → back to sign-in.
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/signin/);
  });

  test('zero data leaks to client storage — the token is never in localStorage', async ({
    page,
    request,
  }) => {
    const { token } = (await (await request.get(`${TOKEN_API}/e2e/token`)).json()) as {
      token: string;
    };
    await page.goto('/signin');
    await page.getByLabel('API token').fill(token);
    await page.getByRole('button', { name: /sign in/i }).click();
    // No `return` param ⇒ land on the overview.
    await expect(page).not.toHaveURL(/\/signin/);

    // The bearer token must live only in the httpOnly cookie — never in JS-readable storage.
    const storage = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      cookieVisible: document.cookie,
    }));
    expect(storage.local).not.toContain(token);
    expect(storage.session).not.toContain(token);
    expect(storage.cookieVisible).not.toContain(token);
  });
});
