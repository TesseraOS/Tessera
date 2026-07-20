import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * DESIGN-LINT — the enforcement half of docs/design/DOCS-DESIGN.md (ADR-0054).
 *
 * This suite compiles `enforcement.bannedPatterns` / `enforcement.requiredPatterns` from
 * docs/design/docs-design.manifest.json and fails the standard `test` gate on any
 * violation. If a case fails: FIX THE CODE. Editing a pattern or adding an `allowIn`
 * exemption is a design decision — it requires updating DOCS-DESIGN.md and the manifest
 * together, and review. Never weaken the contract to make a build pass.
 */

interface BannedPattern {
  id: string;
  pattern: string;
  flags?: string;
  files: string[];
  allowIn?: string[];
  reason: string;
}

interface RequiredPattern {
  id: string;
  pattern: string;
  files: string[];
  reason: string;
}

interface Manifest {
  enforcement: {
    bannedPatterns: BannedPattern[];
    requiredPatterns: RequiredPattern[];
  };
}

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(APP_ROOT, '..', '..', 'docs', 'design', 'docs-design.manifest.json');
const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

/** Directories scanned relative to the app root; tests and configs are exempt by design. */
const SCAN_DIRS = ['app', 'components', 'lib', 'content'];
const EXTENSIONS = ['.ts', '.tsx', '.css', '.mdx'];

function collectFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' || entry === '.next' ? [] : collectFiles(full);
    }
    return EXTENSIONS.some((ext) => entry.endsWith(ext)) ? [full] : [];
  });
}

const sourceFiles = SCAN_DIRS.flatMap((dir) => collectFiles(join(APP_ROOT, dir))).map((file) => ({
  path: relative(APP_ROOT, file).replaceAll('\\', '/'),
  content: readFileSync(file, 'utf8'),
}));

/** Minimal glob → RegExp: `**` any path, `*` any non-slash run, `{a,b}` alternation. */
function globToRegExp(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const char = glob.charAt(i);
    if (char === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (char === '{') {
      const end = glob.indexOf('}', i);
      out += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .join('|')})`;
      i = end + 1;
    } else {
      out += /[a-zA-Z0-9/_-]/.test(char) ? char : `\\${char}`;
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

function filesFor(globs: string[], allowIn: string[] = []) {
  const matchers = globs.map(globToRegExp);
  return sourceFiles.filter(
    (file) => matchers.some((m) => m.test(file.path)) && !allowIn.includes(file.path),
  );
}

describe('design-lint: manifest integrity', () => {
  it('has a populated enforcement contract', () => {
    expect(manifest.enforcement.bannedPatterns.length).toBeGreaterThan(0);
    expect(manifest.enforcement.requiredPatterns.length).toBeGreaterThan(0);
  });

  it('scans a non-empty source tree', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });
});

describe('design-lint: banned patterns (DOCS-DESIGN.md)', () => {
  for (const banned of manifest.enforcement.bannedPatterns) {
    it(`${banned.id} — ${banned.reason}`, () => {
      const regex = new RegExp(banned.pattern, banned.flags ?? '');
      const violations: string[] = [];
      for (const file of filesFor(banned.files, banned.allowIn)) {
        const lines = file.content.split('\n');
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            violations.push(`${file.path}:${index + 1}  ${line.trim().slice(0, 120)}`);
          }
        });
      }
      expect(
        violations,
        `banned pattern "${banned.id}" (${banned.reason}) matched:\n${violations.join('\n')}`,
      ).toEqual([]);
    });
  }
});

describe('design-lint: required patterns (DOCS-DESIGN.md)', () => {
  for (const required of manifest.enforcement.requiredPatterns) {
    it(`${required.id} — ${required.reason}`, () => {
      const files = filesFor(required.files);
      // Zero matching files would silently disable the check — that is itself a failure.
      expect(files.length, `no files matched ${required.files.join(', ')}`).toBeGreaterThan(0);
      const regex = new RegExp(required.pattern);
      const missing = files.filter((file) => !regex.test(file.content)).map((file) => file.path);
      expect(
        missing,
        `required pattern "${required.id}" (${required.reason}) missing from:\n${missing.join('\n')}`,
      ).toEqual([]);
    });
  }
});
