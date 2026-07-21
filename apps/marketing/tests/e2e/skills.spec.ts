import AxeBuilder from '@axe-core/playwright';
import { SKILLS, SKILL_CATEGORIES, skillInstallLocations } from '@tessera/skills';
import { getSkillDocument } from '@tessera/skills/content';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The skills catalog (F-054, MARKETING-DESIGN §3.15). Expectations are derived from the
 * `@tessera/skills` registry — this spec has no hand-written skill list, so adding a skill
 * extends the coverage automatically.
 */

test('the catalog renders every registered skill', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/skills');

  const catalog = page.locator('#catalog');
  for (const skill of SKILLS) {
    await expect(catalog.getByRole('heading', { name: skill.name, exact: true })).toBeVisible();
    await expect(catalog.getByText(skill.headline, { exact: true })).toBeVisible();
  }
  // The count Badge is derived, not asserted as a literal.
  await expect(page.getByText(`${SKILLS.length} first-party skills`)).toBeVisible();
});

test.describe('the category filter works without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('filters to one category and back', async ({ page }) => {
    await page.goto('/skills');

    const catalog = page.locator('#catalog');
    const inCategory = (category: string) => SKILLS.filter((skill) => skill.category === category);
    // Click the LABEL, which is the real user path: the input is visually hidden (focusable
    // but zero-size), and label[for] activation is native — no JavaScript involved.
    const chip = (id: string) => page.locator(`label[for='skill-category-${id}']`);

    for (const category of SKILL_CATEGORIES) {
      await chip(category).click();
      await expect(page.locator(`#skill-category-${category}`)).toBeChecked();

      for (const skill of inCategory(category)) {
        await expect(catalog.getByRole('heading', { name: skill.name, exact: true })).toBeVisible();
      }
      for (const skill of SKILLS.filter((skill) => skill.category !== category)) {
        await expect(catalog.getByRole('heading', { name: skill.name, exact: true })).toBeHidden();
      }
    }

    await chip('all').click();
    for (const skill of SKILLS) {
      await expect(catalog.getByRole('heading', { name: skill.name, exact: true })).toBeVisible();
    }
  });
});

test('the filter is a keyboard-operable radio group', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/skills');

  const group = page.getByRole('group', { name: 'Filter skills by category' });
  await expect(group).toBeVisible();

  const all = page.locator('#skill-category-all');
  await all.focus();
  await expect(all).toBeFocused();
  // Arrow keys move within a native radio group — the reason this is not a button row.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`#skill-category-${SKILL_CATEGORIES[0]}`)).toBeChecked();
});

for (const skill of SKILLS) {
  test(`/skills/${skill.name} has one h1 and passes axe AA on both themes`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto(`/skills/${skill.name}`);

    const heading = page.locator('h1');
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText(skill.headline);

    const dusk = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(dusk.violations).toEqual([]);

    await page.getByRole('button', { name: 'Noon' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    const noon = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(noon.violations).toEqual([]);
  });

  test(`/skills/${skill.name} has no horizontal overflow at 375px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/skills/${skill.name}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`/skills/${skill.name}/skill.md serves the registry document byte for byte`, async ({
    request,
  }) => {
    const response = await request.get(`/skills/${skill.name}/skill.md`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/markdown');
    // THE anti-hand-copy proof: the download path and the registry are the same bytes, which
    // is also what `tessera skills install` writes and what `get_skill` returns.
    expect(await response.text()).toBe(getSkillDocument(skill.name));
  });
}

test('a detail page states where the skill installs, per agent', async ({ page }) => {
  const skill = SKILLS[0];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/skills/${skill.name}`);

  const install = page.locator('#install');
  await expect(install.getByText(`tessera skills install ${skill.name}`)).toBeVisible();
  for (const location of skillInstallLocations(skill.name)) {
    await expect(install.getByText(location.project, { exact: true })).toBeVisible();
  }
});

test('sitemap and llms.txt list every skill and its raw document', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const llms = await (await request.get('/llms.txt')).text();

  for (const skill of SKILLS) {
    expect(sitemap).toContain(`/skills/${skill.name}`);
    expect(llms).toContain(`/skills/${skill.name}`);
    expect(llms).toContain(`/skills/${skill.name}/skill.md`);
  }
  // The registry shipped, so the page no longer says it is coming.
  expect(llms).not.toContain('in development');
});
