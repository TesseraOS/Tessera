import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/load';
import { createLocalRuntime } from '../../src/profiles/local';
import type { Runtime } from '../../src/runtime';

/**
 * F-071: a scan must index into the (tenant, project) that registered the source. This test drives a
 * REAL Local runtime and asserts the tenant that scanned can see its own content while another tenant
 * cannot.
 *
 * It is written against today's API (`sources.forTenant`, `search.forTenant`), so it COMPILES at HEAD
 * and **fails** before a line of `src/` changes — content today lands in DEFAULT_TENANT_ID, so `acme`
 * sees nothing and `default` wrongly sees everything. Capture that red output; never commit it green
 * against unchanged production code.
 */
describe('scope-aware ingestion (F-071)', () => {
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
    const dataDir = await tempDir('tessera-scope-data-');
    const config = loadConfig({
      TESSERA_SQLITE_PATH: ':memory:',
      TESSERA_VECTOR_PATH: ':memory:',
      TESSERA_BLOB_ROOT: join(dataDir, 'blobs'),
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '8',
    });
    return createLocalRuntime(config);
  }

  /** A one-file repo whose content carries a distinctive term, plus a code file for the graph. */
  async function writeFixture(root: string, term: string): Promise<void> {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'README.md'), `# Repo\n\nThe ${term} subsystem lives here.\n`);
    await writeFile(join(root, 'src', 'ledger.ts'), `export const ${term} = 1;\n`);
  }

  it('indexes into the scanning tenant, and invisibly to others', async () => {
    const rt = (runtime = await makeRuntime());
    const repo = await tempDir('tessera-scope-repo-');
    const TERM = 'quernstone';
    await writeFixture(repo, TERM);

    // Register + scan AS TENANT `acme`.
    const acmeSources = rt.services.sources.forTenant('acme');
    const source = await acmeSources.register({ kind: 'filesystem', config: { root: repo } });
    const { summary } = await acmeSources.scan(source.id);
    expect(summary.added).toBeGreaterThan(0); // the diff enqueued real work either way

    // acme SEES its own content — search, compile, and the graph.
    const acmeHits = await rt.services.search.forTenant('acme').search({ text: TERM });
    expect(acmeHits.length, 'acme must find what acme scanned').toBeGreaterThan(0);

    const acmePkg = await rt.services.compiler
      .forTenant('acme')
      .compile({ task: `explain the ${TERM} subsystem`, budget: 2000 });
    expect(acmePkg.sections.length, 'acme must compile its own content').toBeGreaterThan(0);

    const acmeGraph = await rt.services.graph.forTenant('acme').counts();
    expect(acmeGraph.nodes, 'acme must have graph nodes from its code').toBeGreaterThan(0);

    // globex sees NOTHING — the isolation guarantee, across all three read surfaces.
    const globexHits = await rt.services.search.forTenant('globex').search({ text: TERM });
    expect(globexHits, 'globex must not see acme content').toEqual([]);
    const globexGraph = await rt.services.graph.forTenant('globex').counts();
    expect(globexGraph.nodes, 'globex graph must be empty').toBe(0);

    // And it did NOT leak into the default tenant either.
    const defaultHits = await rt.services.search.forTenant('default').search({ text: TERM });
    expect(defaultHits, 'content must not land in the default tenant').toEqual([]);
  });

  it('isolates by PROJECT within a tenant, not only by tenant (F-050 carve-out)', async () => {
    const rt = (runtime = await makeRuntime());
    const repo = await tempDir('tessera-scope-proj-');
    const TERM = 'sunstone';
    await writeFixture(repo, TERM);

    // Scan under acme's project `beta` (forTenant → default project, then forProject → beta).
    const betaSources = rt.services.sources.forTenant('acme').forProject('beta');
    const source = await betaSources.register({ kind: 'filesystem', config: { root: repo } });
    await betaSources.scan(source.id);

    // Visible in (acme, beta)…
    const inBeta = await rt.services.search
      .forTenant('acme')
      .forProject('beta')
      .search({ text: TERM });
    expect(inBeta.length, 'acme/beta must find what acme/beta scanned').toBeGreaterThan(0);

    // …but not in acme's DEFAULT project, and not in another tenant.
    const inAcmeDefault = await rt.services.search.forTenant('acme').search({ text: TERM });
    expect(inAcmeDefault, 'acme default project must not see beta content').toEqual([]);
    const inGlobex = await rt.services.search.forTenant('globex').search({ text: TERM });
    expect(inGlobex, 'another tenant must not see acme/beta content').toEqual([]);
  });
});
