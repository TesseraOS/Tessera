#!/usr/bin/env node
/**
 * Regenerates the checked-in brand masters from the package's mood data (ADR-0046):
 *   docs/design/brand/tessera-mascot.svg        — Tess at rest
 *   docs/design/brand/tessera-mascot-moods.svg  — the full mood sheet
 *
 * Run after `pnpm --filter @tessera/mascot build`. A package test fails when the
 * checked-in files drift from the data — regenerate, never hand-edit.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.join(here, '..', 'dist', 'masters.js');
if (!existsSync(distEntry)) {
  console.error(
    'render-masters: dist/ is missing — run `pnpm --filter @tessera/mascot build` first.',
  );
  process.exit(1);
}

const { renderMascotMasterSvg, renderMoodSheetSvg } = await import(pathToFileURL(distEntry).href);

const brandDir = path.resolve(here, '..', '..', '..', 'docs', 'design', 'brand');
await mkdir(brandDir, { recursive: true });

const targets = [
  ['tessera-mascot.svg', renderMascotMasterSvg()],
  ['tessera-mascot-moods.svg', renderMoodSheetSvg()],
];
for (const [name, svg] of targets) {
  const file = path.join(brandDir, name);
  await writeFile(file, svg, 'utf8');
  console.log(`render-masters: wrote ${path.relative(process.cwd(), file)}`);
}
