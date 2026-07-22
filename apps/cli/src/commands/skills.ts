import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  SKILLS,
  SKILL_CATEGORIES,
  SKILL_TARGETS,
  findSkill,
  type SkillCategory,
  type SkillManifest,
  type SkillTarget,
} from '@tessera/skills';
import { getSkillDocument } from '@tessera/skills/content';
import { flagBool, flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { CliError } from '../errors.js';
import { errline, line, type Io } from '../io.js';
import { printJson, renderTable } from '../output.js';

/**
 * `tessera skills` — the human/scripted install path for the first-party skills registry (F-054,
 * FR-69). The MCP twin is `list_skills`/`get_skill` (ADR-0036 parity); both read the SAME
 * `@tessera/skills` package, so a skill installed from a terminal and one fetched by an agent are
 * byte-identical.
 *
 * No runtime boot anywhere in this command: skills are static data compiled into the package, so
 * every path is instant and works before `tessera init` has ever run.
 */

/** The default install target: `.claude/skills` is read natively by Claude Code and by Cursor. */
const DEFAULT_TARGET_ID = 'claude-code';

const knownSkillNames = (): string => SKILLS.map((skill) => skill.name).join(', ');
const knownTargetIds = (): string => SKILL_TARGETS.map((target) => target.id).join(', ');

function requireSkill(name: string | undefined, subcommand: string): SkillManifest {
  if (name === undefined) {
    throw new CliError(`skills ${subcommand} needs a <name>`, {
      hint: `e.g. tessera skills ${subcommand} compile-before-coding`,
    });
  }
  const skill = findSkill(name);
  if (skill === undefined) {
    throw new CliError(`unknown skill '${name}'`, { hint: `known skills: ${knownSkillNames()}` });
  }
  return skill;
}

function requireCategory(value: string | undefined): SkillCategory | undefined {
  if (value === undefined) return undefined;
  const category = SKILL_CATEGORIES.find((candidate) => candidate === value);
  if (category === undefined) {
    throw new CliError(`unknown category '${value}'`, {
      hint: `known categories: ${SKILL_CATEGORIES.join(', ')}`,
    });
  }
  return category;
}

function requireTarget(value: string | undefined): SkillTarget {
  const id = value ?? DEFAULT_TARGET_ID;
  const target = SKILL_TARGETS.find((candidate) => candidate.id === id);
  if (target === undefined) {
    throw new CliError(`unknown agent '${id}'`, { hint: `known agents: ${knownTargetIds()}` });
  }
  return target;
}

/**
 * The directory the skill folder is created under. `--dir` wins (an explicit root, resolved against
 * `cwd`); otherwise the target's home or project directory. The `~/` prefix in
 * {@link SkillTarget.homeDir} is a DISPLAY form — it is resolved through `home` here, never passed
 * to the filesystem, because nothing expands it for a Node write (a regression would silently
 * create a directory literally named `~`).
 *
 * Exported and fully parameterized so the home branch is unit-testable WITHOUT writing into the
 * real home directory — a test that installed there for real could delete someone's own skill on
 * cleanup.
 */
export function resolveInstallRoot(options: {
  readonly cwd: string;
  readonly home: string;
  readonly target: SkillTarget;
  readonly explicitDir?: string | undefined;
  readonly global?: boolean;
}): string {
  const { cwd, home, target, explicitDir, global = false } = options;
  if (explicitDir !== undefined) {
    return isAbsolute(explicitDir) ? explicitDir : resolve(cwd, explicitDir);
  }
  if (global) {
    return join(home, ...target.homeDir.replace(/^~\//, '').split('/'));
  }
  return join(cwd, ...target.projectDir.split('/'));
}

function runList(io: Io, argv: readonly string[]): number {
  const args = parseArgs(argv, { booleans: ['json'] });
  const category = requireCategory(flagStr(args, 'category'));
  const skills =
    category === undefined ? SKILLS : SKILLS.filter((skill) => skill.category === category);

  if (flagBool(args, 'json')) {
    printJson(io, { skills });
    return 0;
  }

  if (skills.length === 0) {
    line(io, `No skills in category '${category ?? ''}'.`);
    return 0;
  }
  line(
    io,
    renderTable(skills.map((skill) => ({ label: `  ${skill.name}`, value: `${skill.headline}` }))),
  );
  line(io);
  line(io, 'Details: tessera skills show <name>   Install: tessera skills install <name>');
  return 0;
}

function runShow(io: Io, argv: readonly string[]): number {
  const args = parseArgs(argv, { booleans: ['json'] });
  const skill = requireSkill(args.positionals[0], 'show');
  const document = getSkillDocument(skill.name);
  if (document === undefined) {
    // Unreachable while the registry gate passes (it asserts manifests and documents agree); a
    // clean error beats an undefined write if that invariant ever breaks.
    throw new CliError(`skill '${skill.name}' has no document`);
  }

  if (flagBool(args, 'json')) {
    printJson(io, { ...skill, document });
    return 0;
  }
  // The raw document, so `tessera skills show x > SKILL.md` is a valid install path of its own.
  io.write(document);
  return 0;
}

function runInstall(io: Io, argv: readonly string[]): number {
  const args = parseArgs(argv, { booleans: ['json', 'global', 'force'] });
  const skill = requireSkill(args.positionals[0], 'install');
  const target = requireTarget(flagStr(args, 'agent'));
  const global = flagBool(args, 'global');
  const document = getSkillDocument(skill.name);
  if (document === undefined) {
    throw new CliError(`skill '${skill.name}' has no document`);
  }

  const root = resolveInstallRoot({
    cwd: io.cwd,
    home: io.home,
    target,
    explicitDir: flagStr(args, 'dir'),
    global,
  });
  const directory = join(root, skill.name);
  const path = join(directory, 'SKILL.md');

  // Idempotent by design: re-running an install is a no-op, so it is safe in a bootstrap script.
  let existing: string | undefined;
  try {
    existing = readFileSync(path, 'utf8');
  } catch {
    existing = undefined;
  }
  if (existing !== undefined && existing.replace(/\r\n/g, '\n') === document) {
    if (flagBool(args, 'json')) {
      printJson(io, {
        name: skill.name,
        version: skill.version,
        agent: target.id,
        path,
        written: false,
        reason: 'identical',
      });
    } else {
      line(io, `Already installed (identical): ${path}`);
    }
    return 0;
  }
  if (existing !== undefined && !flagBool(args, 'force')) {
    throw new CliError(`refusing to overwrite ${path}`, {
      hint: 'the file differs from the registry copy — pass --force to replace it',
    });
  }

  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, document, 'utf8');
  } catch (error) {
    throw new CliError(`could not write ${path}`, {
      cause: error,
      hint: 'check the directory exists and is writable',
    });
  }

  if (flagBool(args, 'json')) {
    printJson(io, {
      name: skill.name,
      version: skill.version,
      agent: target.id,
      path,
      written: true,
    });
  } else {
    line(io, `Installed ${skill.name}@${skill.version} → ${path}`);
    line(io, `${target.label}: ${target.note}`);
  }
  return 0;
}

function runSkills(io: Io, argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  if (sub === 'list') return Promise.resolve(runList(io, argv.slice(1)));
  if (sub === 'show') return Promise.resolve(runShow(io, argv.slice(1)));
  if (sub === 'install') return Promise.resolve(runInstall(io, argv.slice(1)));
  if (sub === undefined) {
    errline(io, "error: missing subcommand — try 'tessera skills list'");
    return Promise.resolve(1);
  }
  throw new CliError(`unknown skills subcommand '${sub}'`, {
    hint: "try 'tessera skills list', 'show', or 'install'",
  });
}

export const skillsCommand: Command = {
  name: 'skills',
  summary: 'Browse + install the first-party agent skills.',
  usage: [
    'Usage: tessera skills list [--category <name>] [--json]',
    '       tessera skills show <name> [--json]',
    '       tessera skills install <name> [--agent <id>] [--global] [--dir <path>] [--force] [--json]',
    '',
    'Versioned SKILL.md instructions that teach an agent the Tessera workflow (FR-69). `show`',
    'writes the raw document to stdout; `install` writes it into an agent skills directory —',
    `by default <cwd>/${SKILL_TARGETS[0].projectDir}/<name>/SKILL.md. --global writes to the`,
    'home-directory location instead, --dir writes under an explicit root, and --force replaces',
    'a file that differs from the registry copy (an identical file is left alone).',
    '',
    `Categories: ${SKILL_CATEGORIES.join(', ')}`,
    `Agents:     ${knownTargetIds()}`,
    '',
    'The same registry the MCP tools list_skills/get_skill serve (ADR-0036 parity).',
  ].join('\n'),
  run: runSkills,
};
