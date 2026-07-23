// The REAL Tessera deployment under test (F-048, NFR-16).
//
// This boots `startApiServer` from @tessera/server — the SAME entry point the shipped `tessera-api`
// binary uses — over the real Local profile (file-backed SQLite + sqlite-vec + filesystem blobs +
// in-process queue). Nothing is stubbed and NO test-only route is grafted on: what the specs drive is
// what a self-hosted operator runs.
//
// Two deliberate choices:
//  - **File-backed SQLite in a temp dir**, not `:memory:` — the agent journey spawns the real
//    `tessera-mcp` binary as a SEPARATE process, which must open the same database (this is exactly how
//    a self-hosted deployment runs the two surfaces). SQLite is in WAL mode, so that is safe.
//  - **Handoff via a file**, not an `/e2e/*` route — the specs run in Node and can read it, so the real
//    server keeps its real surface.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApiServer } from '@tessera/server';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');

const port = Number(process.env.E2E_FULL_API_PORT ?? 3200);
const fixtureRoot = join(packageRoot, 'fixture');
const fixtureBRoot = join(packageRoot, 'fixture-b');
const handoffPath = join(packageRoot, '.tmp', 'handoff.json');

/** A fresh data directory per run — the suite must never depend on a previous run's state. */
const dataDir = mkdtempSync(join(tmpdir(), 'tessera-e2e-full-'));

/**
 * Real Local profile. Fake embeddings are the default so the suite is deterministic and offline;
 * TESSERA_E2E_REAL_EMBEDDINGS=1 swaps in real Transformers.js (env-guarded, per the acceptance).
 */
const realEmbeddings = process.env.TESSERA_E2E_REAL_EMBEDDINGS === '1';
const tesseraEnv = {
  TESSERA_AUTH_MODE: 'token',
  TESSERA_SQLITE_PATH: join(dataDir, 'tessera.db'),
  TESSERA_VECTOR_PATH: join(dataDir, 'vectors.db'),
  TESSERA_BLOB_ROOT: join(dataDir, 'blobs'),
  TESSERA_AUDIT_ENABLED: 'true',
  ...(realEmbeddings
    ? { TESSERA_EMBEDDINGS_PROVIDER: 'transformers' }
    : { TESSERA_EMBEDDINGS_PROVIDER: 'fake', TESSERA_EMBEDDINGS_DIMENSION: '8' }),
};

/**
 * The suite runs under REAL tenants now that F-071 (ADR-0057) threads the scan's scope to the sink —
 * content indexes into the tenant/project that registered the source, not `DEFAULT_TENANT_ID`. The
 * primary journeys run as `acme`; `globex` and the `beta` project exist only to prove isolation
 * (`scope-isolation.spec.ts`): what `acme`/default scanned must be invisible to them, and vice versa.
 * Before F-071 this file was pinned to `default` because a non-default scan landed its content in
 * `default` and searched empty — that constraint is gone.
 */
const PRIMARY_TENANT = 'acme';
const OTHER_TENANT = 'globex';
/** fixture/: src/ledger.ts, src/reporting.ts, docs/decisions.md — pinned so a lost file fails loudly. */
const FIXTURE_FILE_COUNT = 3;
/** fixture-b/: src/beacon.ts — one file, the "sunstone" corpus used to prove cross-scope isolation. */
const FIXTURE_B_FILE_COUNT = 1;

const handle = await startApiServer({
  env: { ...process.env, ...tesseraEnv },
  host: '127.0.0.1',
  port,
});
const { runtime } = handle;

if (runtime.auth.tokenStore === undefined) {
  throw new Error('token mode did not wire a token store');
}
if (runtime.services.projects === undefined) {
  throw new Error('project service was not wired');
}

/** Issue an owner token for a tenant through the real token store. */
async function issueOwner(tenantId, principalId) {
  const { token } = await runtime.auth.tokenStore.issue({
    tenantId,
    principalId,
    roles: ['owner'],
    displayName: `E2E ${tenantId}`,
  });
  return token;
}

/** Register + scan a source through the real pipeline (the in-process queue drains synchronously). */
async function scanFixture(scopedSources, label, root, expectedCount) {
  const source = await scopedSources.register({ kind: 'filesystem', label, config: { root } });
  const { summary } = await scopedSources.scan(source.id);
  // Fail fast, loudly, BEFORE reporting healthy: a suite that starts against an unindexed corpus would
  // report confusing downstream failures instead of the real one.
  if (summary.added !== expectedCount) {
    throw new Error(
      `${label} scan added ${summary.added} documents, expected ${expectedCount}: ${JSON.stringify(summary)}`,
    );
  }
  return { source, summary };
}

const token = await issueOwner(PRIMARY_TENANT, 'e2e-user');
const otherToken = await issueOwner(OTHER_TENANT, 'e2e-other');

// The primary journeys run as acme/default over the quernstone fixture.
const { source, summary } = await scanFixture(
  runtime.sources.forTenant(PRIMARY_TENANT),
  'quernstone-fixture',
  fixtureRoot,
  FIXTURE_FILE_COUNT,
);

// A real project under acme, and the sunstone fixture scanned into it — so isolation can be proven
// ACROSS projects within one tenant, not only across tenants (F-050 carve-out).
const betaProject = await runtime.services.projects.create(PRIMARY_TENANT, { name: 'beta' });
await scanFixture(
  runtime.sources.forTenant(PRIMARY_TENANT).forProject(betaProject.id),
  'sunstone-fixture-acme-beta',
  fixtureBRoot,
  FIXTURE_B_FILE_COUNT,
);

// The same sunstone fixture scanned under a DIFFERENT tenant — globex/default.
await scanFixture(
  runtime.sources.forTenant(OTHER_TENANT),
  'sunstone-fixture-globex',
  fixtureBRoot,
  FIXTURE_B_FILE_COUNT,
);

mkdirSync(dirname(handoffPath), { recursive: true });
writeFileSync(
  handoffPath,
  `${JSON.stringify(
    {
      apiUrl: handle.url,
      token,
      tenantId: PRIMARY_TENANT,
      sourceId: source.id,
      dataDir,
      fixtureRoot,
      scanSummary: summary,
      // The cross-scope actors for scope-isolation.spec.ts (F-071 clauses 2 + 5).
      otherToken,
      otherTenantId: OTHER_TENANT,
      betaProjectId: betaProject.id,
      // The exact env a second process needs to attach to THIS deployment (the agent journey uses it).
      env: tesseraEnv,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `[e2e-full] real server on ${handle.url} · tenant=${PRIMARY_TENANT} (+${OTHER_TENANT}, project=${betaProject.id}) · data=${dataDir} · scan=${JSON.stringify(summary)}`,
);

async function shutdown() {
  await handle.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup: a leftover temp dir must never fail the run.
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
