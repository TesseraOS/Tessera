import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Runtime } from '@tessera/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerRuntime } from './bootstrap.js';
import {
  MCP_CREDENTIAL_SECRET_KEY,
  createRuntimeGateway,
  resolveStdioCredential,
} from './mcp-gateway.js';

/**
 * The stdio credential channel (F-072; ADR-0065).
 *
 * The defect this closes: `defaultCredentialResolver` reads the SDK `authInfo` or an `Authorization`
 * header, and **stdio populates neither** — so in token mode every tool call returned UNAUTHORIZED
 * and nothing in the environment offered a way to hand `tessera-mcp` a token.
 */
describe('stdio credential resolution', () => {
  let runtime: Runtime | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-mcp-cred-'));
    dirs.push(dir);
    return dir;
  }

  /** Boot a runtime in `mode`, with `env` supplying secrets exactly as a launcher would. */
  async function bootRuntime(
    mode: 'none' | 'token',
    env: Record<string, string> = {},
  ): Promise<Runtime> {
    const dir = await tempDir();
    return createServerRuntime({
      // A closed env, so the developer's own TESSERA_* variables cannot decide a test's outcome.
      env: { ...env },
      config: {
        auth: { mode },
        storage: { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') },
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });
  }

  it('reads the token from the env secrets provider (the launcher-supplied channel)', async () => {
    runtime = await bootRuntime('token', {
      [`TESSERA_SECRET_${MCP_CREDENTIAL_SECRET_KEY}`]: 'tok_abc',
    });
    expect(await resolveStdioCredential(runtime)).toBe('tok_abc');
  });

  it('reads the token from a secrets FILE — the channel for synced client configs', async () => {
    // An agent client config is routinely committed or synced between machines, so the operator can
    // keep the value out of it entirely and hand over a path instead.
    const dir = await tempDir();
    const secretsPath = join(dir, 'secrets.json');
    await writeFile(secretsPath, JSON.stringify({ [MCP_CREDENTIAL_SECRET_KEY]: 'tok_from_file' }));

    runtime = await bootRuntime('token', {
      TESSERA_SECRETS_PROVIDER: 'file',
      TESSERA_SECRETS_FILE: secretsPath,
    });
    expect(await resolveStdioCredential(runtime)).toBe('tok_from_file');
  });

  it('trims a trailing newline rather than presenting an unusable Bearer value', async () => {
    // A token pasted into JSON or read from a file routinely carries one, and a Bearer value with a
    // newline is rejected as a bad credential — an error that reads like a wrong token and is not.
    runtime = await bootRuntime('token', {
      [`TESSERA_SECRET_${MCP_CREDENTIAL_SECRET_KEY}`]: 'tok_abc\n',
    });
    expect(await resolveStdioCredential(runtime)).toBe('tok_abc');
  });

  it('REFUSES TO START in token mode with no credential, naming how to fix it', async () => {
    runtime = await bootRuntime('token');
    // Failing here beats booting cleanly and failing all twenty tools: the condition is fatal
    // either way, and an agent client surfaces stderr.
    await expect(resolveStdioCredential(runtime)).rejects.toThrow(/requires an MCP credential/);
    await expect(resolveStdioCredential(runtime)).rejects.toThrow(/TESSERA_SECRET_MCP_TOKEN/);
  });

  it('treats a blank credential as absent, not as a token', async () => {
    runtime = await bootRuntime('token', {
      [`TESSERA_SECRET_${MCP_CREDENTIAL_SECRET_KEY}`]: '   ',
    });
    await expect(resolveStdioCredential(runtime)).rejects.toThrow(/requires an MCP credential/);
  });

  it('reads nothing in zero-auth `none` mode — behaviour unchanged', async () => {
    // The local provider authenticates anything, so a credential here would be theatre. This also
    // pins that the new boot guard cannot break the default local shape.
    runtime = await bootRuntime('none');
    expect(await resolveStdioCredential(runtime)).toBeUndefined();
  });

  it('never puts the credential in the error message', async () => {
    runtime = await bootRuntime('token');
    const error = await resolveStdioCredential(runtime).catch((cause: unknown) => cause);
    expect(String(error)).not.toContain('tok_');
  });
});

describe('createRuntimeGateway credential wiring', () => {
  let runtime: Runtime | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  async function bootLocal(): Promise<Runtime> {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-mcp-gw-'));
    dirs.push(dir);
    return createServerRuntime({
      env: {},
      config: {
        storage: { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') },
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });
  }

  /**
   * Spy on what the runtime's provider is actually handed.
   *
   * Asserting that `guard` resolves would prove nothing here: the local provider authenticates
   * anything, so both branches below would pass with the resolver wired backwards. The observable
   * fact is the credential presented, so that is what these assert.
   */
  function watchCredential(active: Runtime): { seen: () => string | undefined } {
    let seen: string | undefined;
    const provider = active.auth.provider;
    const original = provider.authenticate.bind(provider);
    vi.spyOn(provider, 'authenticate').mockImplementation((input) => {
      seen = input.authorization;
      return original(input);
    });
    return { seen: () => seen };
  }

  it('presents the static credential on a guarded call when one is given', async () => {
    runtime = await bootLocal();
    const watcher = watchCredential(runtime);
    const gateway = createRuntimeGateway(runtime, { staticCredential: 'tok_abc' });

    await gateway.guard('search', {});
    expect(watcher.seen()).toBe('Bearer tok_abc');
  });

  it('keeps the per-request resolver when no static credential is given (the HTTP path)', async () => {
    // The reason `mcp-http.ts` must never pass one: a process-wide credential would authenticate
    // every remote caller as the operator. Omitting it must leave the per-request resolver in place.
    runtime = await bootLocal();
    const watcher = watchCredential(runtime);
    const gateway = createRuntimeGateway(runtime);

    await gateway.guard('search', {
      requestInfo: { headers: { authorization: 'Bearer tok_client' } },
    });
    expect(watcher.seen()).toBe('Bearer tok_client');
  });

  it('does not let a stdio peer override the operator credential', async () => {
    // A stdio peer controls the JSON-RPC message. If the static resolver merged the request context,
    // the peer could name a principal the operator never granted it.
    runtime = await bootLocal();
    const watcher = watchCredential(runtime);
    const gateway = createRuntimeGateway(runtime, { staticCredential: 'tok_operator' });

    await gateway.guard('search', {
      authInfo: { token: 'tok_peer' },
      requestInfo: { headers: { authorization: 'Bearer tok_peer' } },
    });
    expect(watcher.seen()).toBe('Bearer tok_operator');
  });
});
