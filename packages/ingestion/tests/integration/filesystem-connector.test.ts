import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ValidationError } from '@tessera/core';
import { createFilesystemConnector } from '../../src/connectors/filesystem';
import { runConnectorConformance } from '../conformance/connector.conformance';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tessera-fs-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'nested'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'dep'), { recursive: true });
  await writeFile(join(root, 'README.md'), '# Title\n');
  await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  await writeFile(join(root, 'nested', 'b.json'), '{"b":2}\n');
  await writeFile(join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

runConnectorConformance('filesystem', () =>
  Promise.resolve({
    connector: createFilesystemConnector({ root }),
    expectedPaths: ['README.md', 'nested/b.json', 'src/a.ts'],
    missingPath: 'does/not/exist.ts',
  }),
);

describe('filesystem connector specifics', () => {
  it('skips ignored directories such as node_modules', async () => {
    const entries = await createFilesystemConnector({ root }).list();

    expect(entries.some((entry) => entry.path.startsWith('node_modules/'))).toBe(false);
  });

  it('rejects path traversal in resolve', async () => {
    const connector = createFilesystemConnector({ root });

    await expect(connector.resolve('../escape.ts')).rejects.toBeInstanceOf(ValidationError);
  });
});
