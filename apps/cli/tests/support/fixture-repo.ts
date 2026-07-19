import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Write a small fixture repo (a readme, a source file, and an ADR) — the same three-document shape the
 * `@tessera/config` runtime-sources integration test uses, so a scan reports `added: 3`.
 */
export async function writeFixtureRepo(root: string): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'docs', 'adr'), { recursive: true });
  await writeFile(join(root, 'README.md'), '# Project\n\nAuthentication uses signed tokens.\n');
  await writeFile(join(root, 'src', 'index.ts'), 'export const x = 1;\n');
  await writeFile(
    join(root, 'docs', 'adr', '0001-use-sqlite.md'),
    '# Use SQLite locally\n\n- **Status:** accepted\n\n## Decision\n\nUse SQLite for the local profile.\n',
  );
}
