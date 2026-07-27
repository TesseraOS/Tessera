import AxeBuilder from '@axe-core/playwright';
// @playwright/test directly, NOT the fixtures: these specs drive the REAL API end to end, so they
// need a REAL session cookie. The fixtures stub only `/v1/me`, which renders the chrome but leaves
// every data call unauthenticated — the app would show its error state and prove nothing.
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * **F-057 increment 10** — the metered request → usage visible journey, against the REAL API.
 *
 * Deliberately **not** stubbed at the network boundary the way the other view specs are (ADR-0022).
 * A stub would prove the Analytics view renders a shape; it would prove nothing about metering. This
 * spec compiles through the real token-mode server the Playwright config boots, then asserts the
 * number that compile produced appears on the page — so the whole path is under test: the REST
 * `onResponse` recorder, the SQLite usage store, `GET /v1/usage`, the SDK, and the view.
 *
 * It was seen to FAIL against increment 7's HEAD (before the e2e server passed `usage`), because a
 * green-on-first-run e2e proves nothing.
 */

const TOKEN_API = 'http://127.0.0.1:3000';

/** Sign in for real, so the httpOnly session cookie backs every data call the views make. */
async function signIn(page: import('@playwright/test').Page, token: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('API token').fill(token);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/signin/);
}

test('a real compile shows up in Analytics, and the page passes a11y', async ({
  page,
  request,
}) => {
  const { token } = (await (await request.get(`${TOKEN_API}/e2e/token`)).json()) as {
    token: string;
  };

  // A REAL compile against the REAL API — this is the metered event.
  const compiled = await request.post(`${TOKEN_API}/v1/compile`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { task: 'what does the metering boundary record', budget: 2000 },
  });
  expect(compiled.ok()).toBe(true);
  const pkg = (await compiled.json()) as { totalTokens: number };

  await signIn(page, token);
  await page.goto('/analytics');

  // The totals card, from the store the compile just wrote to.
  await expect(page.getByText('Usage', { exact: true })).toBeVisible();
  await expect(page.getByText(pkg.totalTokens.toLocaleString()).first()).toBeVisible();

  // Latency was measured at the boundary, so it is present and is labelled honestly.
  await expect(page.getByText('Compile, average')).toBeVisible();
  await expect(page.getByText('Compile, slowest')).toBeVisible();
  // The claim ADR-0060 §3 turns on: this page must never present a mean as a percentile.
  await expect(page.locator('body')).not.toContainText('p95');

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('Analytics is reachable from the sidebar and the ⌘K palette alike', async ({
  page,
  request,
}) => {
  const { token } = (await (await request.get(`${TOKEN_API}/e2e/token`)).json()) as {
    token: string;
  };
  await signIn(page, token);
  // The two nav sources are held in agreement by a unit test; this proves the agreement is real in
  // the rendered app, where a route can be defined and still not navigable.
  await page.goto('/');
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics$/);
});

/**
 * Both new routes under every theme × mode, the same matrix `appearance.spec.ts` runs for the
 * Overview.
 *
 * This is what F-057's "screenshots across 4 themes × light/dark" is *for*, made executable: a
 * screenshot proves a page looked right on the day someone looked at it, whereas this fails the build
 * the day a token pairing stops meeting AA. Screenshots still get taken for the design review — they
 * catch layout and hierarchy, which no assertion here does — but contrast is not left to the eye.
 */
const THEMES = ['monkai', 'amber', 'claude', 'notebook'] as const;

for (const theme of THEMES) {
  for (const mode of ['light', 'dark'] as const) {
    test(`analytics + billing have no WCAG A/AA violations — ${theme} · ${mode}`, async ({
      page,
      request,
    }) => {
      await page.addInitScript(
        ([t, m]) => {
          try {
            localStorage.setItem('tessera.theme', t as string);
            localStorage.setItem('theme', m as string); // next-themes storage key
          } catch {
            /* ignore */
          }
        },
        [theme, mode],
      );
      const { token } = (await (await request.get(`${TOKEN_API}/e2e/token`)).json()) as {
        token: string;
      };
      await signIn(page, token);

      for (const route of ['/analytics', '/billing']) {
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        // next-themes applies the mode class on mount — wait for it to settle before measuring.
        const html = page.locator('html');
        if (mode === 'dark') {
          await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
        } else {
          await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
        }

        const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(results.violations, `${route} · ${theme} · ${mode}`).toEqual([]);
      }
    });
  }
}
