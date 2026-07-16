import AxeBuilder from '@axe-core/playwright';
import { expect, LOCAL_IDENTITY, LOCAL_RBAC, test } from './support/fixtures';

/**
 * Appearance system (F-070, ADR-0047): the 4-theme catalog × light/dark, its persistence,
 * the no-FOUC pre-paint script, and axe across every theme × mode on representative routes.
 */

const THEMES = ['monkai', 'amber', 'claude', 'notebook'] as const;

test.describe('Appearance — theme catalog', () => {
  test('the header switcher applies a theme (data-theme) and persists it', async ({ page }) => {
    await page.goto('/');

    // Default = monkai (the classless tokens).
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'monkai');

    await page.getByRole('button', { name: /change appearance/i }).click();
    await page.getByRole('menuitem', { name: /amber/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');

    // Persisted + reapplied before paint on reload (no flash of the default).
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
    const preHydrationTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(preHydrationTheme).toBe('amber');
  });

  test('the mode segment toggles the .dark class', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /change appearance/i }).click();
    await page.getByRole('menuitem', { name: /^light$/i }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: /change appearance/i }).click();
    await page.getByRole('menuitem', { name: /^dark$/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('the /settings Appearance card selects a theme', async ({ page }) => {
    await page.goto('/settings');

    await page
      .getByRole('button', { name: /notebook/i })
      .first()
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'notebook');
  });

  test('reduced motion switches instantly (no view transition needed)', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    // This custom context bypasses the fixture's `page`, so re-apply the session stubs (F-045/F-046)
    // — otherwise the unmocked /v1/me 401s and redirects to /signin before the theme toggle.
    await page.route('**/v1/me', (route) => route.fulfill({ json: LOCAL_IDENTITY }));
    await page.route('**/v1/rbac', (route) => route.fulfill({ json: LOCAL_RBAC }));
    await page.goto('/');

    await page.getByRole('button', { name: /change appearance/i }).click();
    await page.getByRole('menuitem', { name: /claude/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'claude');

    await context.close();
  });
});

test.describe('Appearance — accessibility across the catalog', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      test(`overview has no WCAG A/AA violations — ${theme} · ${mode}`, async ({ page }) => {
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
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        // next-themes applies the mode class on mount — wait for it to settle.
        const html = page.locator('html');
        if (mode === 'dark') {
          await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
        } else {
          await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
        }

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        expect(results.violations).toEqual([]);
      });
    }
  }
});
