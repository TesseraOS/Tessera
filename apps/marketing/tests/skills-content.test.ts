import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS, SKILL_CATEGORIES, SKILL_TARGETS } from '@tessera/skills';
import { describe, expect, it } from 'vitest';
import { categoryFilters, installLocations, skillDisplay, skillDisplays } from '@/lib/skills';

/**
 * The skills catalog's honesty contract (F-054 acceptance: "renders FROM the registry — no
 * hand-copied content"). Expectations are DERIVED from `@tessera/skills` at test time, so
 * editing a SKILL.md moves the page and these tests together — while copying a description
 * into a page source fails the scan below.
 *
 * Exactly the mechanism `tests/pricing.test.ts` applies to the plan catalog.
 */

const APP_ROOT = join(import.meta.dirname, '..');
const readSource = (relative: string): string => readFileSync(join(APP_ROOT, relative), 'utf8');

const PAGE_SOURCES = [
  'app/skills/page.tsx',
  'app/skills/[skill]/page.tsx',
  'components/skills/skill-card.tsx',
  'components/skills/skill-filter.tsx',
] as const;

describe('the display model projects the registry', () => {
  it('lists every skill in registry order', () => {
    expect(skillDisplays().map((skill) => skill.name)).toEqual(SKILLS.map((skill) => skill.name));
  });

  it('derives the routes and the install command from the name', () => {
    for (const skill of skillDisplays()) {
      expect(skill.href).toBe(`/skills/${skill.name}`);
      expect(skill.downloadHref).toBe(`/skills/${skill.name}/skill.md`);
      expect(skill.installCommand).toBe(`tessera skills install ${skill.name}`);
    }
  });

  it('carries the manifest fields the cards render', () => {
    for (const manifest of SKILLS) {
      const display = skillDisplay(manifest.name);
      expect(display).toMatchObject({
        description: manifest.description,
        headline: manifest.headline,
        why: manifest.why,
        category: manifest.category,
        version: manifest.version,
      });
    }
  });

  it('returns undefined for an unknown name (the notFound path)', () => {
    expect(skillDisplay('not-a-skill')).toBeUndefined();
  });
});

describe('category filters', () => {
  it('offers All plus every registry category, with real counts', () => {
    const filters = categoryFilters();
    expect(filters.map((filter) => filter.id)).toEqual(['all', ...SKILL_CATEGORIES]);

    const all = filters[0];
    expect(all?.count).toBe(SKILLS.length);
    for (const filter of filters.slice(1)) {
      expect(filter.count).toBe(SKILLS.filter((skill) => skill.category === filter.id).length);
    }
    // Counts must sum to the catalog: a skill in an unlisted category would be unreachable.
    expect(filters.slice(1).reduce((sum, filter) => sum + filter.count, 0)).toBe(SKILLS.length);
  });

  it('has a globals.css rule for every category, or a chip would filter nothing', () => {
    const css = readSource('app/globals.css');
    expect(css).toContain('.skill-filter');
    for (const category of SKILL_CATEGORIES) {
      expect(css, `no .skill-filter rule for '${category}'`).toContain(`value='${category}'`);
      expect(css).toContain(`[data-skill-category='${category}']`);
    }
  });
});

describe('install locations', () => {
  it('renders one row per documented target', () => {
    const locations = installLocations('capture-memory');
    expect(locations.map((location) => location.target)).toEqual(
      SKILL_TARGETS.map((target) => target.id),
    );
    for (const location of locations) {
      expect(location.project).toMatch(/\/capture-memory\/SKILL\.md$/);
      expect(location.home.startsWith('~/')).toBe(true);
    }
  });
});

describe('nothing is hand-copied into the pages', () => {
  const sources = PAGE_SOURCES.map(readSource).join('\n');

  it.each(SKILLS.map((skill) => [skill.name, skill] as const))(
    "%s's authored strings appear nowhere in the page sources",
    (_name, skill) => {
      // If any of these is literally present in a page, the page has stopped rendering the
      // registry and started duplicating it — the exact drift this feature exists to prevent.
      expect(sources).not.toContain(skill.description);
      expect(sources).not.toContain(skill.headline);
      expect(sources).not.toContain(skill.why);
      expect(sources).not.toContain(skill.compatibility);
    },
  );

  it('does not hard-list skill names either', () => {
    for (const skill of SKILLS) {
      // A BARE substring scan, deliberately. The first version of this test looked for the name
      // in quotes, and a name embedded mid-string — `tessera skills install compile-before-coding`
      // in the install-paths block — walked straight past it. A rename would then have shipped a
      // stale command with every gate green.
      //
      // Known limit: today's names are multi-word kebab slugs, so they cannot collide with ordinary
      // prose. A future single-word skill (`memory`, `search`) would false-red against these four
      // files. Left as-is because the failure message names the skill, so diagnosis is immediate —
      // but scope the scan if that day comes rather than deleting the assertion.
      expect(sources, `${skill.name} is written into a page source`).not.toContain(skill.name);
    }
  });

  it('does not hard-list install directories either', () => {
    for (const target of SKILL_TARGETS) {
      expect(sources, `${target.projectDir} is written into a page source`).not.toContain(
        target.projectDir,
      );
    }
  });

  it('routes and sitemap enumerate the registry rather than a literal list', () => {
    for (const relative of [
      'app/sitemap.ts',
      'app/llms.txt/route.ts',
      'app/skills/[skill]/skill.md/route.ts',
    ]) {
      expect(readSource(relative)).toMatch(/SKILL_NAMES|SKILLS/);
    }
  });
});
