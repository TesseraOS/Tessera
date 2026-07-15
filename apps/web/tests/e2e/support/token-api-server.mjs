// A REAL token-mode Tessera API for the auth e2e (F-045). It boots the Local profile in-process with
// `:memory:` SQLite + fake embeddings (zero external deps, offline/CI-safe), enforces Bearer auth, and
// issues one owner token. A test-only `/e2e/token` route hands that token to the spec (never a
// production surface). The web app's proxy is pointed at this server via TESSERA_API_URL.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '@tessera/api';
import { createLocalRuntime, loadConfig } from '@tessera/config';

const port = Number(process.env.TOKEN_API_PORT ?? 3000);
const blobRoot = join(mkdtempSync(join(tmpdir(), 'tessera-e2e-')), 'blobs');

const config = loadConfig({
  TESSERA_AUTH_MODE: 'token',
  TESSERA_SQLITE_PATH: ':memory:',
  TESSERA_VECTOR_PATH: ':memory:',
  TESSERA_BLOB_ROOT: blobRoot,
  TESSERA_EMBEDDINGS_PROVIDER: 'fake',
  TESSERA_EMBEDDINGS_DIMENSION: '8',
  TESSERA_AUDIT_ENABLED: 'false',
});

const runtime = await createLocalRuntime(config, { env: process.env });
if (runtime.auth.tokenStore === undefined) {
  throw new Error('token mode did not wire a token store');
}
const { token } = await runtime.auth.tokenStore.issue({
  tenantId: 'acme',
  principalId: 'e2e-user',
  roles: ['owner'],
  displayName: 'E2E User',
});

const app = buildServer(runtime.services, {
  auth: runtime.auth.provider,
  events: runtime.events,
});

// Test-only channel so the spec can read the issued token. NOT a production route.
app.get('/e2e/token', () => ({ token }));

await app.listen({ host: '127.0.0.1', port });
console.log(`[token-api] listening on http://127.0.0.1:${port} (auth: token)`);

async function shutdown() {
  await app.close();
  await runtime.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
