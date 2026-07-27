#!/usr/bin/env node
/**
 * Pack every publishable workspace package into one directory (F-059).
 *
 * The publish set is derived from `private` in each manifest rather than listed here, so it cannot
 * drift from what `changeset publish` will actually push. A hand-maintained list is exactly how the
 * F-054 note ended up naming three packages when the CLI's real dependency closure is eighteen —
 * and that mistake is invisible to every build and test in this repo, because `workspace:*` always
 * resolves inside the workspace. It only surfaces as a 404 on a user's `npm install`.
 *
 * Usage: node scripts/pack-publishable.mjs [outDir]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, process.argv[2] ?? 'dist-packages');
mkdirSync(outDir, { recursive: true });

/** Workspace roots that contain package directories (mirrors pnpm-workspace.yaml). */
const WORKSPACE_ROOTS = ['packages', 'apps', 'tests'];

const publishable = [];
for (const base of WORKSPACE_ROOTS) {
  const baseDir = join(root, base);
  if (!existsSync(baseDir)) continue;
  for (const entry of readdirSync(baseDir)) {
    const manifestPath = join(baseDir, entry, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.private === true) continue;
    publishable.push({ name: manifest.name, dir: join(baseDir, entry) });
  }
}

if (publishable.length === 0) {
  console.error('no publishable packages found — every manifest is private, which cannot be right');
  process.exit(1);
}

publishable.sort((a, b) => a.name.localeCompare(b.name));
for (const { name, dir } of publishable) {
  execFileSync('pnpm', ['pack', '--pack-destination', outDir], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  console.log(`packed ${name}`);
}

const tarballs = readdirSync(outDir).filter((file) => file.endsWith('.tgz'));
console.log(
  `\n${String(publishable.length)} publishable package(s), ${String(tarballs.length)} tarball(s) in ${outDir}`,
);
if (tarballs.length !== publishable.length) {
  console.error('tarball count does not match the publishable set — a pack silently failed');
  process.exit(1);
}
