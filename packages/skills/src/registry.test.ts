import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generate, loadRegistry, parseSkill } from '../scripts/generate.mjs';
import { SKILLS, SKILL_NAMES } from './generated/catalog.js';
import { SKILL_DOCUMENTS } from './generated/documents.js';
import { findSkill, skillInstallLocations, skillInstallPath } from './index.js';
import { getSkillDocument } from './content.js';
import { SKILL_CATEGORIES, SKILL_TARGETS } from './types.js';

/**
 * THE REGISTRY GATE (F-054 acceptance: "each skill has a manifest validated in CI").
 *
 * Three obligations in one suite: every SKILL.md is spec-conformant and internally honest; the
 * committed `src/generated/` modules are byte-identical to a fresh parse of the registry; and the
 * strict parser refuses malformed input rather than mis-reading it.
 *
 * If the drift assertion fails, a SKILL.md changed without the generated data following it:
 *   pnpm --filter @tessera/skills generate
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_DIR = join(PACKAGE_ROOT, 'registry');

/** Spec: https://agentskills.io/specification */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function registryDirectories(): string[] {
  return readdirSync(REGISTRY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe('registry discovery', () => {
  it('exposes exactly the skills on disk', () => {
    expect([...SKILL_NAMES]).toEqual(registryDirectories());
    expect(SKILLS.map((skill) => skill.name)).toEqual(registryDirectories());
    expect(Object.keys(SKILL_DOCUMENTS).sort()).toEqual(registryDirectories());
  });

  it('is not empty and has no duplicate names', () => {
    expect(SKILLS.length).toBeGreaterThan(0);
    expect(new Set(SKILL_NAMES).size).toBe(SKILL_NAMES.length);
  });

  it('carries the four acceptance skills (FR-69)', () => {
    expect([...SKILL_NAMES]).toEqual(
      expect.arrayContaining([
        'compile-before-coding',
        'effects-before-editing',
        'capture-memory',
        'project-onboarding',
      ]),
    );
  });
});

describe('manifest conformance', () => {
  it.each(SKILLS.map((skill) => [skill.name, skill] as const))(
    '%s satisfies the Agent Skills spec',
    (name, skill) => {
      expect(skill.name).toBe(name);
      expect(skill.name.length).toBeLessThanOrEqual(64);
      expect(skill.name).toMatch(NAME_PATTERN);

      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
      expect(skill.compatibility.length).toBeGreaterThan(0);
      expect(skill.compatibility.length).toBeLessThanOrEqual(500);
    },
  );

  it.each(SKILLS.map((skill) => [skill.name, skill] as const))(
    '%s carries valid tessera.* metadata',
    (_name, skill) => {
      expect(skill.version).toMatch(SEMVER_PATTERN);
      expect(SKILL_CATEGORIES).toContain(skill.category);
      expect(skill.headline.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(skill.why.length).toBeGreaterThan(0);
      expect(skill.tools.length).toBeGreaterThan(0);
    },
  );

  it.each(SKILLS.map((skill) => [skill.name, skill] as const))(
    '%s only advertises tools its instructions actually teach',
    (name, skill) => {
      const document = getSkillDocument(name);
      expect(document).toBeDefined();
      for (const tool of skill.tools) {
        expect(document, `${name} lists ${tool} but never mentions it`).toContain(tool);
      }
    },
  );

  it.each(registryDirectories())('%s round-trips: the document IS the manifest', (name) => {
    // The DOCUMENT half is the independent check: the shipped bytes must equal the file on disk,
    // so the artifact an agent installs is the artifact in the repo. The manifest half re-parses
    // with the same parser the generator used, so it proves the committed catalog matches a fresh
    // parse (staleness) — NOT that the parser invents nothing. Field-level honesty is covered by
    // the conformance assertions above.
    const document = readFileSync(join(REGISTRY_DIR, name, 'SKILL.md'), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    expect(getSkillDocument(name)).toBe(document);
    expect(parseSkill(name, document)).toEqual(findSkill(name));
  });

  it('keeps every body within the progressive-disclosure budget', () => {
    for (const [name, document] of Object.entries(SKILL_DOCUMENTS)) {
      expect(document.split('\n').length, `${name} is too long`).toBeLessThanOrEqual(400);
      expect(document, `${name} must not contain CRLF`).not.toContain('\r');
    }
  });
});

describe('generated modules are current', () => {
  it('match a fresh regeneration byte-for-byte', () => {
    const artifacts = generate();
    expect(Object.keys(artifacts).length).toBe(2);
    for (const [name, expected] of Object.entries(artifacts)) {
      const committed = readFileSync(join(PACKAGE_ROOT, name), 'utf8');
      expect(
        committed,
        `${name} is stale — run \`pnpm --filter @tessera/skills generate\` and commit`,
      ).toBe(expected);
    }
  });

  it('agrees with the hand-written category list', () => {
    const { manifests } = loadRegistry();
    for (const manifest of manifests) {
      expect(SKILL_CATEGORIES).toContain(manifest.category);
    }
  });
});

describe('the parser refuses malformed skills', () => {
  const valid = [
    '---',
    'name: example',
    'description: Does a thing. Use when a thing is needed.',
    'compatibility: Requires a connected Tessera MCP server.',
    'metadata:',
    "  tessera.version: '1.0.0'",
    '  tessera.category: workflow',
    '  tessera.headline: Do the thing',
    '  tessera.why: Not doing it costs more.',
    '  tessera.tools: search',
    '---',
    '',
    '# Example',
    '',
    'Call search when you need a thing.',
    '',
  ].join('\n');

  it('accepts the reference document', () => {
    expect(parseSkill('example', valid).name).toBe('example');
  });

  it('rejects a missing opening fence', () => {
    expect(() => parseSkill('example', valid.slice(4))).toThrow(/frontmatter fence/);
  });

  it('rejects an unclosed fence', () => {
    expect(() =>
      parseSkill('example', valid.replace('\n---\n\n# Example', '\n\n# Example')),
    ).toThrow(/never closed/);
  });

  it('rejects a duplicate key rather than silently taking the last', () => {
    const duplicated = valid.replace('name: example', 'name: example\nname: other');
    expect(() => parseSkill('example', duplicated)).toThrow(/not valid YAML/);
  });

  it('rejects a non-string metadata value', () => {
    expect(() => parseSkill('example', valid.replace("'1.0.0'", '1'))).toThrow(/must be a string/);
  });

  it('rejects a name that disagrees with its directory', () => {
    expect(() => parseSkill('other', valid)).toThrow(/must match its directory/);
  });

  it('rejects an unknown frontmatter key', () => {
    expect(() =>
      parseSkill('example', valid.replace('name: example', 'name: example\nauthor: me')),
    ).toThrow(/unknown frontmatter key/);
  });

  it('rejects an unknown category', () => {
    expect(() =>
      parseSkill('example', valid.replace('category: workflow', 'category: misc')),
    ).toThrow(/is not one of/);
  });

  it('rejects a non-semver version', () => {
    expect(() => parseSkill('example', valid.replace("'1.0.0'", "'1.0'"))).toThrow(
      /must be semver/,
    );
  });

  it('rejects a tool the body never teaches', () => {
    expect(() =>
      parseSkill('example', valid.replace('tessera.tools: search', 'tessera.tools: get_stats')),
    ).toThrow(/never mentions it/);
  });

  it('rejects Markdown in prose fields, which render as plain text everywhere', () => {
    // Regression guard: the F-054 screenshot review caught `tessera init` rendering WITH its
    // backticks on the public detail page. The body is markdown; these fields are not.
    expect(() => parseSkill('example', valid.replace('Do the thing', 'Do the `thing`'))).toThrow(
      /Markdown syntax/,
    );
    expect(() => parseSkill('example', valid.replace('Not doing it', 'Not **doing** it'))).toThrow(
      /Markdown syntax/,
    );
  });

  it('rejects an over-long headline', () => {
    const wordy = valid.replace(
      'headline: Do the thing',
      'headline: Do the thing and then do nine more things',
    );
    expect(() => parseSkill('example', wordy)).toThrow(/keep it to 8/);
  });
});

describe('install locations', () => {
  it('renders one location per documented target', () => {
    const locations = skillInstallLocations('compile-before-coding');
    expect(locations).toHaveLength(SKILL_TARGETS.length);
    expect(locations.map((location) => location.target)).toEqual(
      SKILL_TARGETS.map((target) => target.id),
    );
  });

  it('builds display paths from the target directories', () => {
    const [claudeCode] = SKILL_TARGETS;
    expect(skillInstallPath(claudeCode, 'capture-memory')).toBe(
      '.claude/skills/capture-memory/SKILL.md',
    );
    expect(skillInstallPath(claudeCode, 'capture-memory', 'home')).toBe(
      '~/.claude/skills/capture-memory/SKILL.md',
    );
  });

  it('has unique target ids and no duplicate directories', () => {
    const ids = SKILL_TARGETS.map((target) => target.id);
    const dirs = SKILL_TARGETS.map((target) => target.projectDir);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(dirs).size).toBe(dirs.length);
  });
});

describe('lookups', () => {
  it('returns undefined for an unknown skill', () => {
    expect(findSkill('nope')).toBeUndefined();
    expect(getSkillDocument('nope')).toBeUndefined();
  });

  it('does not leak Object.prototype members', () => {
    expect(getSkillDocument('toString')).toBeUndefined();
    expect(getSkillDocument('constructor')).toBeUndefined();
  });
});
