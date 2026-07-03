import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createEnvSecretsProvider,
  createFileSecretsProvider,
  createSecretsProvider,
} from './index.js';

describe('env secrets provider', () => {
  const provider = createEnvSecretsProvider({
    env: { TESSERA_SECRET_API_KEY: 'sk-123' },
    prefix: 'TESSERA_SECRET_',
  });

  it('reads a prefixed value', async () => {
    expect(await provider.get('API_KEY')).toBe('sk-123');
  });

  it('returns undefined for a missing key, and require throws', async () => {
    expect(await provider.get('NOPE')).toBeUndefined();
    await expect(provider.require('NOPE')).rejects.toThrow();
  });
});

describe('file secrets provider', () => {
  let dir: string;
  let path: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-secrets-'));
    path = join(dir, 'secrets.json');
    await writeFile(path, JSON.stringify({ DB_URL: 'postgres://x' }), 'utf8');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a value and requires a present one', async () => {
    const provider = createFileSecretsProvider({ path });
    expect(await provider.get('DB_URL')).toBe('postgres://x');
    expect(await provider.require('DB_URL')).toBe('postgres://x');
  });

  it('require throws for a missing key', async () => {
    await expect(createFileSecretsProvider({ path }).require('MISSING')).rejects.toThrow();
  });
});

describe('createSecretsProvider', () => {
  it('selects the file provider and requires a path', () => {
    expect(() => createSecretsProvider({ provider: 'file', envPrefix: '' })).toThrow(
      /secrets\.file/,
    );
  });

  it('defaults to the env provider', async () => {
    const provider = createSecretsProvider(
      { provider: 'env', envPrefix: 'P_' },
      { P_TOKEN: 'abc' },
    );
    expect(await provider.get('TOKEN')).toBe('abc');
  });
});
