/**
 * `@tessera/skills` — the first-party agent skills registry (F-054, FR-69; ADR-0036 §3).
 *
 * ONE engine, three surfaces: the marketing catalog (`apps/marketing/app/skills`), the CLI
 * (`tessera skills`), and the MCP tools (`list_skills` / `get_skill`) all render what this package
 * exports, so no surface can hand-copy a skill and none can drift from another.
 *
 * This entry carries MANIFESTS ONLY. The SKILL.md bodies live behind the separate
 * `@tessera/skills/content` entry, which makes NFR-4's "a listing must not ship bodies"
 * structural rather than a rule someone has to remember.
 *
 * Editing a `registry/<name>/SKILL.md` requires `pnpm --filter @tessera/skills generate`; ADDING or
 * RENAMING one additionally moves the marketing static params + sitemap, the MCP input enum, and
 * therefore `apps/docs`'s generated reference (effect-link E-027).
 */
export type {
  SkillCategory,
  SkillInstallLocation,
  SkillManifest,
  SkillScope,
  SkillTarget,
  SkillTargetId,
} from './types.js';
export { SKILL_CATEGORIES, SKILL_TARGETS } from './types.js';
export { SKILLS, SKILL_NAMES } from './generated/catalog.js';

import type { SkillInstallLocation, SkillManifest, SkillScope, SkillTarget } from './types.js';
import { SKILL_TARGETS } from './types.js';
import { SKILLS } from './generated/catalog.js';

/** The manifest for `name`, or `undefined` when no such skill exists. */
export function findSkill(name: string): SkillManifest | undefined {
  return SKILLS.find((skill) => skill.name === name);
}

/**
 * The path a skill occupies inside a target's skills directory, in DISPLAY form (always forward
 * slashes — this is what a page or a tool response shows). The CLI joins real paths with
 * `node:path` instead, so Windows separators stay correct on disk.
 */
export function skillInstallPath(
  target: SkillTarget,
  name: string,
  scope: SkillScope = 'project',
): string {
  const directory = scope === 'home' ? target.homeDir : target.projectDir;
  return `${directory}/${name}/SKILL.md`;
}

/** Every place `name` can be installed — what `get_skill` returns and the detail page renders. */
export function skillInstallLocations(name: string): readonly SkillInstallLocation[] {
  return SKILL_TARGETS.map((target) => ({
    target: target.id,
    label: target.label,
    note: target.note,
    project: skillInstallPath(target, name, 'project'),
    home: skillInstallPath(target, name, 'home'),
  }));
}
