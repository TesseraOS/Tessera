import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SKILLS, SKILL_TARGETS } from '@tessera/skills';
import { getSkillDocument } from '@tessera/skills/content';
import { captureIo } from '../../tests/support/capture-io.js';
import { run } from '../cli.js';
import { resolveInstallRoot } from './skills.js';

/**
 * `tessera skills` (F-054). Every path here is pure static data + the filesystem — no runtime boot —
 * so these are fast unit tests, not e2e.
 */
describe('skills list', () => {
  it('lists every registered skill', async () => {
    const io = captureIo();
    expect(await run(['skills', 'list'], io)).toBe(0);
    for (const skill of SKILLS) {
      expect(io.out()).toContain(skill.name);
      expect(io.out()).toContain(skill.headline);
    }
    expect(io.out()).toContain('tessera skills install');
  });

  it('emits the manifests under --json', async () => {
    const io = captureIo();
    expect(await run(['skills', 'list', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as { skills: { name: string; document?: string }[] };
    expect(parsed.skills.map((skill) => skill.name)).toEqual(SKILLS.map((skill) => skill.name));
    // A listing must never carry bodies (NFR-4) — the same rule the MCP twin obeys.
    for (const skill of parsed.skills) {
      expect(skill.document).toBeUndefined();
    }
  });

  it('filters by category', async () => {
    const io = captureIo();
    expect(await run(['skills', 'list', '--category', 'setup', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as { skills: { category: string }[] };
    expect(parsed.skills.length).toBeGreaterThan(0);
    expect(parsed.skills.every((skill) => skill.category === 'setup')).toBe(true);
  });

  it('rejects an unknown category by name', async () => {
    const io = captureIo();
    expect(await run(['skills', 'list', '--category', 'wizardry'], io)).toBe(1);
    expect(io.err()).toContain("unknown category 'wizardry'");
    expect(io.err()).toContain('known categories:');
  });
});

describe('skills show', () => {
  it('writes the exact registry document to stdout', async () => {
    const io = captureIo();
    expect(await run(['skills', 'show', 'capture-memory'], io)).toBe(0);
    expect(io.out()).toBe(getSkillDocument('capture-memory'));
  });

  it('includes the manifest under --json', async () => {
    const io = captureIo();
    expect(await run(['skills', 'show', 'capture-memory', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as { name: string; version: string; document: string };
    expect(parsed.name).toBe('capture-memory');
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.document).toBe(getSkillDocument('capture-memory'));
  });

  it('needs a name', async () => {
    const io = captureIo();
    expect(await run(['skills', 'show'], io)).toBe(1);
    expect(io.err()).toContain('skills show needs a <name>');
  });

  it('names the catalog when the skill is unknown', async () => {
    const io = captureIo();
    expect(await run(['skills', 'show', 'nope'], io)).toBe(1);
    expect(io.err()).toContain("unknown skill 'nope'");
    expect(io.err()).toContain('compile-before-coding');
  });
});

describe('skills install', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'tessera-skills-cli-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes SKILL.md byte-identically under --dir', async () => {
    const root = join(dir, 'explicit');
    const io = captureIo();
    expect(await run(['skills', 'install', 'compile-before-coding', '--dir', root], io)).toBe(0);

    const path = join(root, 'compile-before-coding', 'SKILL.md');
    expect(readFileSync(path, 'utf8')).toBe(getSkillDocument('compile-before-coding'));
    expect(io.out()).toContain('Installed compile-before-coding@');
    expect(io.out()).toContain(path);
  });

  it('is idempotent — a second install writes nothing and still succeeds', async () => {
    const root = join(dir, 'idempotent');
    expect(await run(['skills', 'install', 'capture-memory', '--dir', root], captureIo())).toBe(0);

    const io = captureIo();
    expect(await run(['skills', 'install', 'capture-memory', '--dir', root, '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as { written: boolean; reason?: string };
    expect(parsed.written).toBe(false);
    expect(parsed.reason).toBe('identical');
  });

  it('refuses to clobber a modified file, and replaces it with --force', async () => {
    const root = join(dir, 'modified');
    const path = join(root, 'capture-memory', 'SKILL.md');
    mkdirSync(join(root, 'capture-memory'), { recursive: true });
    writeFileSync(path, '# my own edits\n', 'utf8');

    const refused = captureIo();
    expect(await run(['skills', 'install', 'capture-memory', '--dir', root], refused)).toBe(1);
    expect(refused.err()).toContain('refusing to overwrite');
    expect(refused.err()).toContain('--force');
    expect(readFileSync(path, 'utf8')).toBe('# my own edits\n');

    const forced = captureIo();
    expect(
      await run(['skills', 'install', 'capture-memory', '--dir', root, '--force'], forced),
    ).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(getSkillDocument('capture-memory'));
  });

  it('defaults to the claude-code project directory, relative to cwd', async () => {
    const cwd = join(dir, 'project');
    mkdirSync(cwd, { recursive: true });
    const io = captureIo({ cwd });
    expect(await run(['skills', 'install', 'effects-before-editing', '--json'], io)).toBe(0);

    const parsed = JSON.parse(io.out()) as { agent: string; path: string };
    expect(parsed.agent).toBe('claude-code');
    expect(parsed.path).toBe(join(cwd, '.claude', 'skills', 'effects-before-editing', 'SKILL.md'));
    expect(readFileSync(parsed.path, 'utf8')).toBe(getSkillDocument('effects-before-editing'));
  });

  it('honours --agent for every documented target', async () => {
    for (const target of SKILL_TARGETS) {
      const cwd = join(dir, `agent-${target.id}`);
      mkdirSync(cwd, { recursive: true });
      const io = captureIo({ cwd });
      expect(
        await run(['skills', 'install', 'project-onboarding', '--agent', target.id, '--json'], io),
      ).toBe(0);
      const parsed = JSON.parse(io.out()) as { path: string };
      expect(parsed.path).toBe(
        join(cwd, ...target.projectDir.split('/'), 'project-onboarding', 'SKILL.md'),
      );
    }
  });

  it('--global writes under the injected home, never a literal "~"', async () => {
    // The CALL SITE, not just resolveInstallRoot: a wiring regression (passing cwd as home) would
    // slip past the pure unit tests and past every --dir test, because --dir never reads home.
    // `home` is injected through Io, so this exercises the real write without touching the user's
    // actual ~/.claude/skills — deleting from there on cleanup could destroy a skill they wrote.
    const home = join(dir, 'fake-home');
    const cwd = join(dir, 'elsewhere');
    mkdirSync(cwd, { recursive: true });
    const io = captureIo({ home, cwd });

    expect(await run(['skills', 'install', 'capture-memory', '--global', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as { path: string };

    expect(parsed.path).toBe(join(home, '.claude', 'skills', 'capture-memory', 'SKILL.md'));
    expect(parsed.path).not.toContain('~');
    expect(parsed.path.startsWith(cwd)).toBe(false);
    expect(readFileSync(parsed.path, 'utf8')).toBe(getSkillDocument('capture-memory'));
  });

  it('names the known agents when --agent is wrong', async () => {
    const io = captureIo();
    expect(await run(['skills', 'install', 'capture-memory', '--agent', 'emacs'], io)).toBe(1);
    expect(io.err()).toContain("unknown agent 'emacs'");
    expect(io.err()).toContain('claude-code');
  });

  it('needs a name', async () => {
    const io = captureIo();
    expect(await run(['skills', 'install'], io)).toBe(1);
    expect(io.err()).toContain('skills install needs a <name>');
  });
});

describe('install root resolution', () => {
  const [claudeCode] = SKILL_TARGETS;

  it('resolves --global through the home directory, never a literal "~"', () => {
    const root = resolveInstallRoot({
      cwd: '/repo',
      home: '/home/dev',
      target: claudeCode,
      global: true,
    });
    expect(root).toBe(join('/home/dev', '.claude', 'skills'));
    expect(root).not.toContain('~');
  });

  it('defaults to the project directory under cwd', () => {
    expect(resolveInstallRoot({ cwd: '/repo', home: '/home/dev', target: claudeCode })).toBe(
      join('/repo', '.claude', 'skills'),
    );
  });

  it('lets --dir win over both, resolving a relative path against cwd', () => {
    expect(
      resolveInstallRoot({
        cwd: '/repo',
        home: '/home/dev',
        target: claudeCode,
        explicitDir: './out',
        global: true,
      }),
      // `resolve`, not `join`: on Windows a bare POSIX root resolves against the current drive,
      // so the expectation has to go through the same platform rule the code does.
    ).toBe(resolve('/repo', 'out'));
  });

  it('resolves every target to its own documented directory', () => {
    for (const target of SKILL_TARGETS) {
      expect(resolveInstallRoot({ cwd: '/repo', home: '/home/dev', target, global: true })).toBe(
        join('/home/dev', ...target.homeDir.replace(/^~\//, '').split('/')),
      );
    }
  });
});

describe('skills (dispatch)', () => {
  it('reports a missing subcommand', async () => {
    const io = captureIo();
    expect(await run(['skills'], io)).toBe(1);
    expect(io.err()).toContain('missing subcommand');
  });

  it('rejects an unknown subcommand', async () => {
    const io = captureIo();
    expect(await run(['skills', 'uninstall'], io)).toBe(1);
    expect(io.err()).toContain("unknown skills subcommand 'uninstall'");
  });

  it('is listed in the top-level help', async () => {
    const io = captureIo();
    expect(await run(['--help'], io)).toBe(0);
    expect(io.out()).toContain('skills');
  });

  it('prints its usage on --help', async () => {
    const io = captureIo();
    expect(await run(['skills', '--help'], io)).toBe(0);
    expect(io.out()).toContain('tessera skills install');
    expect(io.out()).toContain('--global');
  });
});
