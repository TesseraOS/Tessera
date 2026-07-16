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
 * **Do not change this to a non-default tenant without fixing F-071 first.**
 *
 * Ingestion indexes into the DEFAULT tenant unconditionally (`createIndexingDocumentSink` calls
 * `indexDocument` with no `tenantId`; see the "ingestion runs in the default tenant (F-038 boundary)"
 * note in `packages/config/src/sources/ingestion-sink.ts`). So a source registered under tenant
 * `acme` scans "successfully" — `added: 3` — and its content lands in `default`, invisible to `acme`.
 * F-048 found this; F-071 fixes it.
 *
 * Until then the honest deployment to test is the single-tenant one, which is the shipped local shape
 * (ADR-0003): token auth on, everything in the default tenant. Point this at `acme` and the human
 * journey fails with an empty search for reasons that have nothing to do with the dashboard.
 */
const TENANT = 'default';
/** fixture/: src/ledger.ts, src/reporting.ts, docs/decisions.md — pinned so a lost file fails loudly. */
const FIXTURE_FILE_COUNT = 3;

const handle = await startApiServer({
  env: { ...process.env, ...tesseraEnv },
  host: '127.0.0.1',
  port,
});
const { runtime } = handle;

if (runtime.auth.tokenStore === undefined) {
  throw new Error('token mode did not wire a token store');
}
const { token } = await runtime.auth.tokenStore.issue({
  tenantId: TENANT,
  principalId: 'e2e-user',
  roles: ['owner'],
  displayName: 'E2E User',
});

// Register the fixture repository as a real source and scan it through the real ingestion pipeline.
// The in-process queue drains, so the scan is synchronous-complete by the time this resolves.
const sources = runtime.sources.forTenant(TENANT);
const source = await sources.register({
  kind: 'filesystem',
  label: 'quernstone-fixture',
  config: { root: fixtureRoot },
});
const { summary } = await sources.scan(source.id);

// Fail fast, loudly, BEFORE reporting healthy: a suite that starts against an unindexed corpus would
// report confusing downstream failures instead of the real one. The fixture is 3 files, all new on a
// fresh data dir, so `added` must be 3.
if (summary.added !== FIXTURE_FILE_COUNT) {
  throw new Error(
    `fixture scan added ${summary.added} documents, expected ${FIXTURE_FILE_COUNT}: ${JSON.stringify(summary)}`,
  );
}

mkdirSync(dirname(handoffPath), { recursive: true });
writeFileSync(
  handoffPath,
  `${JSON.stringify(
    {
      apiUrl: handle.url,
      token,
      tenantId: TENANT,
      sourceId: source.id,
      dataDir,
      fixtureRoot,
      scanSummary: summary,
      // The exact env a second process needs to attach to THIS deployment (the agent journey uses it).
      env: tesseraEnv,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `[e2e-full] real server on ${handle.url} · tenant=${TENANT} · data=${dataDir} · scan=${JSON.stringify(summary)}`,
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
