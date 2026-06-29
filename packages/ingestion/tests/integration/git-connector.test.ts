import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGitConnector } from '../../src/connectors/git';
import { runConnectorConformance } from '../conformance/connector.conformance';

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const available = gitAvailable();
let root: string;

function git(args: readonly string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

describe.skipIf(!available)('git connector', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tessera-git-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'README.md'), '# Repo\n');
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(root, '.gitignore'), 'ignored.txt\n');
    await writeFile(join(root, 'ignored.txt'), 'do not track me\n');

    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Tessera Test']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['add', '-A']);
    git(['commit', '-m', 'initial commit']);
  });

  afterAll(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  runConnectorConformance('git', () =>
    Promise.resolve({
      connector: createGitConnector({ root }),
      expectedPaths: ['.gitignore', 'README.md', 'src/a.ts'],
      missingPath: 'nope.ts',
    }),
  );

  it('lists only tracked files, honoring .gitignore', async () => {
    const entries = await createGitConnector({ root }).list();

    expect(entries.some((entry) => entry.path === 'ignored.txt')).toBe(false);
  });

  it('enriches resolved documents with repo-level git provenance', async () => {
    const raw = await createGitConnector({ root }).resolve('README.md');
    const metadata = raw?.metadata as Record<string, unknown>;
    const provenance = metadata['git'] as Record<string, unknown>;

    expect(metadata['connector']).toBe('git');
    expect(provenance['headCommit']).toMatch(/^[0-9a-f]{40}$/);
    expect(provenance['author']).toBe('Tessera Test');
    expect(typeof provenance['branch']).toBe('string');
  });
});
