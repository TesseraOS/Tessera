import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import mcpTools from '../../generated/mcp-tools.json' with { type: 'json' };

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The representative page battery (DOCS-DESIGN §7): every section is exercised — home,
 * content prose, a concepts page, an agent guide, a generated-data reference page, and
 * deployment. Each gets: one h1, axe AA on BOTH themes (dusk default → noon via the
 * real toggle), and the 375px no-overflow check.
 */
const PAGES = [
  { path: '/', h1: 'Every scattered piece' },
  { path: '/docs', h1: 'Introduction' },
  { path: '/docs/quickstart', h1: 'Quickstart' },
  { path: '/docs/concepts/context-compiler', h1: 'Context Compiler' },
  { path: '/docs/agents/claude-code', h1: 'Claude Code' },
  { path: '/docs/reference/mcp-tools', h1: 'MCP tools' },
  { path: '/docs/deployment/self-host-docker', h1: 'Self-hosting with Docker' },
] as const;

for (const { path, h1 } of PAGES) {
  test(`${path} has one h1 and passes axe AA on both themes`, async ({ page }) => {
    // Steady-state scan: reduced motion is the designed final layout (DOCS-DESIGN §4).
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto(path);

    const heading = page.locator('h1');
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText(h1);

    const dusk = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(dusk.violations).toEqual([]);

    // Switch to noon through the real control (the user path, not a class hack).
    await page
      .getByRole('button', { name: 'Switch to the noon (light) theme' })
      .first()
      .click();
    await expect(page.locator('html')).toHaveClass(/light/);
    const noon = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(noon.violations).toEqual([]);
  });

  test(`${path} has no horizontal overflow at 375px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the theme choice persists across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/docs');
  await page
    .getByRole('button', { name: 'Switch to the noon (light) theme' })
    .first()
    .click();
  await expect(page.locator('html')).toHaveClass(/light/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/light/);
});

test('search finds concepts by name', async ({ page }) => {
  await page.goto('/docs');
  // The real user path: the search trigger (its accessible name may include the
  // keyboard hint, e.g. "Search Ctrl K") opens the dialog.
  await page.getByRole('button', { name: /Search/ }).first().click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByPlaceholder('Search');
  await expect(input).toBeVisible();
  await input.fill('effect-links');
  // The Orama index serves a real hit for a real page (results render as buttons).
  await expect(dialog.getByText('Effect-links', { exact: false }).first()).toBeVisible();
});

test('a generated REST reference page renders the operation and playground', async ({ page }) => {
  await page.goto('/docs/reference/api/v1/search/post');
  await expect(page.locator('h1')).toContainText('Hybrid search');
  await expect(page.getByText('/v1/search').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
});

test('the MCP reference lists every tool the server reports', async ({ page }) => {
  await page.goto('/docs/reference/mcp-tools');
  for (const tool of mcpTools.tools) {
    await expect(
      page.getByRole('heading', { level: 2, name: tool.name, exact: true }),
    ).toBeVisible();
  }
});

test('the 404 shows the missing-tile statement with a way home', async ({ page }) => {
  await page.goto('/docs/this-page-does-not-exist');
  await expect(page.locator('h1')).toContainText('A tile is');
  await expect(page.getByRole('link', { name: 'Open the documentation' })).toBeVisible();
});

test('llms.txt, llms-full.txt, and the sitemap serve the agent-readable surface', async ({
  request,
}) => {
  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  const llmsText = await llms.text();
  for (const { path } of PAGES) {
    if (path === '/') continue;
    expect(llmsText).toContain(path);
  }

  const full = await request.get('/llms-full.txt');
  expect(full.status()).toBe(200);
  const fullText = await full.text();
  expect(fullText).toContain('# Quickstart');
  expect(fullText.length).toBeGreaterThan(50_000);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  for (const { path } of PAGES) {
    if (path === '/') continue;
    expect(sitemapText).toContain(path);
  }
});
