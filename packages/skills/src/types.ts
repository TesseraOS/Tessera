/**
 * The skills registry contract (F-054, FR-69; ADR-0036 §3).
 *
 * A skill is a directory under `registry/` containing a spec-conformant `SKILL.md`
 * (https://agentskills.io/specification): YAML frontmatter + a Markdown body. The frontmatter
 * **is** the manifest — there is no sibling metadata file, so the manifest cannot disagree with
 * the artifact an agent installs, and the single file that gets copied carries everything.
 *
 * Tessera-specific fields live under the spec's `metadata` map with `tessera.*` keys (the spec
 * requires string values; lists are comma-separated and split here). {@link SkillManifest} is the
 * parsed projection the three surfaces render — never re-parse the markdown downstream.
 */

/** Categories a skill can belong to (the marketing catalog's filter axis). */
export const SKILL_CATEGORIES = ['workflow', 'setup'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/**
 * A skill's parsed frontmatter. `version` is the skill's own semver, independent of the package
 * version: a skill is a versioned artifact that agents install and later re-fetch.
 */
export interface SkillManifest {
  /** Spec `name`: lowercase/hyphen, equals the registry directory name, unique. */
  readonly name: string;
  /** Spec `description`: what it does AND when to use it (this is what agents match against). */
  readonly description: string;
  /** `metadata['tessera.version']` — semver for this skill's instructions. */
  readonly version: string;
  /** `metadata['tessera.category']`. */
  readonly category: SkillCategory;
  /** `metadata['tessera.headline']` — the short statement a catalog card leads with. */
  readonly headline: string;
  /** `metadata['tessera.why']` — one line: the cost of not doing this. */
  readonly why: string;
  /**
   * `metadata['tessera.tools']` — the Tessera MCP tools the body actually instructs the agent to
   * call. Cross-checked against the real tool catalog in `apps/mcp` (the registry package must not
   * depend on the MCP server), and against the body itself here: a tool listed but never mentioned
   * is a stale manifest.
   */
  readonly tools: readonly string[];
  /** Spec `compatibility` — the environment this skill needs (a connected Tessera MCP server). */
  readonly compatibility: string;
}

/**
 * Where an installed skill goes, per agent. A DATA TABLE, not code: supporting another agent is a
 * row. Paths are the ones each vendor documents — never inferred, because a wrong path fails
 * silently (the agent simply never loads the skill).
 */
export interface SkillTarget {
  readonly id: string;
  /** Human-readable name of the agent (or standard) that reads this directory. */
  readonly label: string;
  /** Project-scoped directory, relative to the repository root. */
  readonly projectDir: string;
  /** Home-scoped directory, in the `~`-prefixed display form. */
  readonly homeDir: string;
  /** What reads this location — stated because several agents read more than one. */
  readonly note: string;
}

/**
 * The install destinations, in recommendation order. `claude-code` leads because `.claude/skills`
 * is read natively by Claude Code and by Cursor's compatibility loader; `.agents/skills` is the
 * cross-agent standard location (Cursor and Codex CLI both scan it, Claude Code does not).
 *
 * Sources: agentskills.io/specification, code.claude.com/docs/en/skills, cursor.com/docs/skills,
 * docs.cline.bot/customization/skills, developers.openai.com/codex/skills.
 */
export const SKILL_TARGETS = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    projectDir: '.claude/skills',
    homeDir: '~/.claude/skills',
    note: 'Read by Claude Code, and by Cursor for compatibility.',
  },
  {
    id: 'agents',
    label: 'Agent Skills standard',
    projectDir: '.agents/skills',
    homeDir: '~/.agents/skills',
    note: 'The cross-agent location — scanned by Cursor and Codex CLI.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    projectDir: '.cursor/skills',
    homeDir: '~/.cursor/skills',
    note: "Cursor's own directory.",
  },
  {
    id: 'cline',
    label: 'Cline',
    projectDir: '.cline/skills',
    homeDir: '~/.cline/skills',
    note: "Cline's own directory.",
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    projectDir: '.codex/skills',
    homeDir: '~/.codex/skills',
    note: 'Read by Codex CLI, and by Cursor for compatibility.',
  },
] as const satisfies readonly SkillTarget[];

export type SkillTargetId = (typeof SKILL_TARGETS)[number]['id'];

/** Project-scoped (committed, shared with the team) or home-scoped (personal, all projects). */
export type SkillScope = 'project' | 'home';

/** Every place one skill can be installed — what `get_skill` returns and the detail page renders. */
export interface SkillInstallLocation {
  readonly target: SkillTargetId;
  readonly label: string;
  readonly note: string;
  /** e.g. `.claude/skills/compile-before-coding/SKILL.md` */
  readonly project: string;
  /** e.g. `~/.claude/skills/compile-before-coding/SKILL.md` */
  readonly home: string;
}
