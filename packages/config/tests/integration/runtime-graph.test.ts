import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/load';
import { createLocalRuntime } from '../../src/profiles/local';
import type { Runtime } from '../../src/runtime';

/**
 * F-040: scanning a repo populates the knowledge graph from real code (tree-sitter), so
 * `get_effects` returns real ranked dependents with paths. Runs the tree-sitter WASM extractor
 * offline (prebuilt grammars).
 */
describe('runtime knowledge-graph population (F-040)', () => {
  let runtime: Runtime | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  async function makeRuntime(): Promise<Runtime> {
    const dataDir = await tempDir('tessera-graph-data-');
    return createLocalRuntime(
      loadConfig({
        TESSERA_SQLITE_PATH: ':memory:',
        TESSERA_VECTOR_PATH: ':memory:',
        TESSERA_BLOB_ROOT: join(dataDir, 'blobs'),
        TESSERA_EMBEDDINGS_PROVIDER: 'fake',
        TESSERA_EMBEDDINGS_DIMENSION: '8',
      }),
    );
  }

  async function scanRepo(rt: Runtime): Promise<void> {
    const repo = await tempDir('tessera-graph-repo-');
    await writeFile(join(repo, 'b.ts'), 'export function helper() {\n  return 42;\n}\n');
    await writeFile(
      join(repo, 'a.ts'),
      "import { helper } from './b';\n\nexport function run() {\n  return helper();\n}\n",
    );
    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });
    await rt.services.sources.scan(source.id);
  }

  it('get_effects returns real dependents from extracted imports', async () => {
    const rt = (runtime = await makeRuntime());
    await scanRepo(rt);

    // a.ts imports ./b ⇒ changing b affects a. File keys are extensionless (ADR-0041).
    const effects = await rt.services.graph.getEffects({ kind: 'file', key: 'b' });
    expect(effects.map((hit) => hit.node.key)).toContain('a');
    // The dependent carries a path (FR-19).
    expect(effects[0]?.path.length ?? 0).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('is idempotent on re-scan (no duplicate dependents)', async () => {
    const rt = (runtime = await makeRuntime());
    await scanRepo(rt);
    // Re-scan the same source (unchanged) — the manifest skips files, the graph is unchanged.
    const [source] = await rt.services.sources.list();
    if (source !== undefined) await rt.services.sources.scan(source.id);

    const effects = await rt.services.graph.getEffects({ kind: 'file', key: 'b' });
    expect(effects.filter((hit) => hit.node.key === 'a')).toHaveLength(1);
  }, 30_000);
});
