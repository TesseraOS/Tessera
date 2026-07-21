import {
  SKILLS,
  SKILL_CATEGORIES,
  findSkill,
  skillInstallLocations,
  type SkillCategory,
  type SkillInstallLocation,
  type SkillManifest,
} from '@tessera/skills';

/**
 * Skills catalog display model (MARKETING-DESIGN §3.15, F-054): every word on `/skills`
 * is DERIVED from the `@tessera/skills` registry — the same manifests the CLI prints and
 * the MCP `list_skills` tool returns. Nothing is hand-copied; tests/skills-content.test.ts
 * proves it by scanning the page sources for registry strings.
 *
 * Exactly the role `lib/pricing.ts` plays for the plan catalog.
 */

export interface SkillDisplay extends SkillManifest {
  /** The detail page for this skill. */
  readonly href: string;
  /** The raw SKILL.md, served statically — the download install path. */
  readonly downloadHref: string;
  /** The CLI install path. */
  readonly installCommand: string;
}

function toDisplay(manifest: SkillManifest): SkillDisplay {
  return {
    ...manifest,
    href: `/skills/${manifest.name}`,
    downloadHref: `/skills/${manifest.name}/skill.md`,
    installCommand: `tessera skills install ${manifest.name}`,
  };
}

/** Every skill, in registry order. */
export function skillDisplays(): readonly SkillDisplay[] {
  return SKILLS.map(toDisplay);
}

/** One skill, or `undefined` when the name is not in the registry (the 404 path). */
export function skillDisplay(name: string): SkillDisplay | undefined {
  const manifest = findSkill(name);
  return manifest === undefined ? undefined : toDisplay(manifest);
}

export interface CategoryFilter {
  /** `all` plus one entry per registry category — the radio values the CSS device keys on. */
  readonly id: 'all' | SkillCategory;
  readonly label: string;
  readonly count: number;
}

const titleCase = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

/** The filter chips, counts included — derived, so a new category needs no page edit. */
export function categoryFilters(): readonly CategoryFilter[] {
  return [
    { id: 'all', label: 'All', count: SKILLS.length },
    ...SKILL_CATEGORIES.map((category) => ({
      id: category,
      label: titleCase(category),
      count: SKILLS.filter((skill) => skill.category === category).length,
    })),
  ];
}

/** Where a skill installs, per agent — the same table `get_skill` returns to an agent. */
export function installLocations(name: string): readonly SkillInstallLocation[] {
  return skillInstallLocations(name);
}
