import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createPostgresStore } from '@tessera/storage';
import { DEFAULT_CORPUS_SCOPE, putFragment } from '../../src/fragment-source';
import { createRuntime } from '../../src/profiles/create-runtime';
import { loadConfig } from '../../src/load';
import type { Runtime } from '../../src/runtime';

/**
 * **F-056 clause 1, end to end.** The `self-hosted` profile boots for real against Postgres + MinIO +
 * Redis and serves everything the Local profile does — with no SQLite anywhere in the data path.
 *
 *   docker compose up -d
 *   TESSERA_TEST_SELF_HOSTED=1 pnpm --filter @tessera/config test
 *
 * Kept behind its own guard rather than `TESSERA_TEST_POSTGRES`, because this one needs all three
 * services, not just the database.
 */
const enabled = process.env['TESSERA_TEST_SELF_HOSTED'] === '1';
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const REDIS_URL = process.env['TESSERA_REDIS_URL'] ?? 'redis://127.0.0.1:6379';
const S3_ENDPOINT = process.env['TESSERA_S3_ENDPOINT'] ?? 'http://127.0.0.1:9000';

let schemaCounter = 0;

interface Booted {
  readonly runtime: Runtime;
  readonly cleanup: () => Promise<void>;
}

/**
 * Boot a real self-hosted runtime into its own Postgres schema, so a run cannot see another run's
 * rows and the migration pass is exercised from empty every time.
 */
async function boot(overrides: Record<string, unknown> = {}): Promise<Booted> {
  schemaCounter += 1;
  const schema = `sh_${Date.now().toString(36)}_${schemaCounter}`;
  const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
  await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
  await admin.close();

  // `search_path=<schema>,public` — NOT the schema alone. `CREATE EXTENSION vector` installs the
  // `vector` TYPE into public, so a path that excludes public fails every pgvector statement with
  // `type "vector" does not exist`. A real deployment keeps public on the path; the other Postgres
  // suites get away with schema-only because none of them touch the vector store.
  const scopedUrl = `${CONNECTION_STRING}?options=-c%20search_path%3D${schema},public`;
  // Secrets travel through the SecretsProvider, exactly as an operator would supply them — and the
  // SAME env must reach createRuntime, since that is what the provider reads at construction.
  const env = {
    TESSERA_SECRET_DATABASE_URL: scopedUrl,
    TESSERA_SECRET_REDIS_URL: REDIS_URL,
    TESSERA_SECRET_S3_ACCESS_KEY_ID: 'tessera',
    TESSERA_SECRET_S3_SECRET_ACCESS_KEY: 'tessera-secret',
  };
  const config = loadConfig(env, {
    profile: 'self-hosted',
    embeddings: { provider: 'fake', dimension: 8 },
    storage: { s3: { bucket: 'tessera', endpoint: S3_ENDPOINT, forcePathStyle: true } },
    ...overrides,
  });

  const runtime = await createRuntime(config, { env });
  return {
    runtime,
    cleanup: async () => {
      await runtime.close();
      const cleaner = createPostgresStore({ connectionString: CONNECTION_STRING });
      await cleaner.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await cleaner.close();
    },
  };
}

describe.skipIf(!enabled)('self-hosted profile (TESSERA_TEST_SELF_HOSTED=1)', () => {
  let booted: Booted | undefined;

  afterEach(async () => {
    await booted?.cleanup();
    booted = undefined;
  });

  it('boots, applies its own schema, and reports ready', async () => {
    // The profile used to throw here. That it constructs at all is the F-023/ADR-0026 deferral closing.
    booted = await boot();
    const readiness = await booted.runtime.services.readiness?.();
    expect(readiness).toMatchObject({ ready: true, checks: [{ name: 'postgres', ok: true }] });
  });

  it('captures a memory and finds it again through search — the whole path on Postgres', async () => {
    booted = await boot();
    const { services } = booted.runtime;

    const captured = await services.memory.capture({
      kind: 'decision',
      title: 'Adopt Postgres for self-hosted',
      body: 'The self-hosted profile uses Postgres for every store in the data path.',
    });
    expect(captured.id).toBeTruthy();

    // Capture goes through the indexing decorator, so it lands in the blob corpus AND the keyword,
    // temporal, and vector indices — which is what makes this a real end-to-end assertion rather
    // than a round-trip through one table.
    // The corpus ref for a memory is its LINEAGE, not the version id: an edited memory keeps one
    // searchable document rather than accumulating one per version (memory-indexing.ts).
    const results = await services.search.search({ text: 'postgres self-hosted' });
    expect(results.map((hit) => hit.ref)).toContain(`memory/${captured.lineageId}`);
  });

  it('indexes and compiles exactly as the Local profile does (the parity assertion)', async () => {
    // Deliberately the SAME sequence and assertions as local-profile.test.ts: index into the keyword
    // retriever, search, put a fragment, compile, check the budget. If the profiles behave the same
    // here, FR-53's "no code change between modes" is a fact rather than a claim.
    booted = await boot();
    const rt = booted.runtime;

    await rt.keyword.index('doc:auth', 'authentication uses signed tokens to verify the caller');
    const results = await rt.services.search.search({ text: 'authentication tokens' });
    expect(results.map((candidate) => candidate.ref)).toContain('doc:auth');

    await putFragment(
      rt.stores.blob,
      {
        ref: 'doc:auth',
        text: 'authentication uses signed tokens to verify the caller',
        kind: 'markdown',
      },
      DEFAULT_CORPUS_SCOPE,
    );
    const pkg = await rt.services.compiler.compile({ task: 'authentication tokens', budget: 200 });
    const refs = pkg.sections
      .flatMap((section) => section.fragments)
      .map((fragment) => fragment.ref);
    expect(refs).toContain('doc:auth');
    expect(pkg.totalTokens).toBeLessThanOrEqual(200);
  });

  it('uses S3 for the corpus — the fragment body comes back from the bucket', async () => {
    booted = await boot();
    const { services, stores } = booted.runtime;

    const captured = await services.memory.capture({
      kind: 'lesson',
      title: 'Blob round trip',
      body: 'This text must be readable straight out of the object store.',
    });

    // Straight from the BlobStore the runtime wired, bypassing every service above it.
    // The key carries its owning (tenant, project) since F-075/ADR-0067.
    const bytes = await stores.blob.get(
      `${DEFAULT_CORPUS_SCOPE.tenantId}/${DEFAULT_CORPUS_SCOPE.projectId}/memory/${captured.lineageId}`,
    );
    expect(new TextDecoder().decode(bytes)).toContain('readable straight out of the object store');
  });

  it('issues and verifies a token from the Postgres store under auth.mode=token', async () => {
    booted = await boot({ auth: { mode: 'token' } });
    const tokenStore = booted.runtime.auth.tokenStore;
    expect(tokenStore).toBeDefined();

    const { token, record } = await tokenStore!.issue({
      tenantId: 'acme',
      principalId: 'ci-bot',
      roles: ['member'],
    });
    expect(await tokenStore!.verify(token)).toMatchObject({ id: record.id, tenantId: 'acme' });
  });

  it('records into the Postgres audit trail', async () => {
    booted = await boot();
    const audit = booted.runtime.audit;
    expect(audit).toBeDefined();

    await audit!.forTenant('acme').record({
      tenantId: 'acme',
      actor: { principalId: 'user-1', kind: 'user' },
      action: 'search',
      outcome: 'success',
    });
    const { events } = await audit!.forTenant('acme').query();
    expect(events).toHaveLength(1);
  });

  it('refuses to boot without the secrets it needs, naming the setting', async () => {
    // A self-hosted profile that started with a missing DATABASE_URL and failed later, mid-request,
    // would be far worse than one that refuses at boot.
    const config = loadConfig(
      {},
      {
        profile: 'self-hosted',
        embeddings: { provider: 'fake', dimension: 8 },
        storage: { s3: { bucket: 'tessera' } },
      },
    );
    await expect(createRuntime(config)).rejects.toThrow(/DATABASE_URL/);
  });

  it('refuses to boot without an S3 bucket', async () => {
    const env = {
      TESSERA_SECRET_DATABASE_URL: CONNECTION_STRING,
      TESSERA_SECRET_REDIS_URL: REDIS_URL,
      TESSERA_SECRET_S3_ACCESS_KEY_ID: 'tessera',
      TESSERA_SECRET_S3_SECRET_ACCESS_KEY: 'tessera-secret',
    };
    const config = loadConfig(env, {
      profile: 'self-hosted',
      embeddings: { provider: 'fake', dimension: 8 },
    });
    await expect(createRuntime(config, { env })).rejects.toThrow(/storage\.s3\.bucket/);
  });
});
