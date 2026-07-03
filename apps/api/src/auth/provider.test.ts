import { describe, expect, it } from 'vitest';
import { TesseraError } from '@tessera/core';
import { createLocalAuthProvider, createTokenAuthProvider, parseBearer } from './provider.js';
import { createInMemoryTokenStore } from './token-store.js';

describe('parseBearer', () => {
  it('extracts the token from a Bearer header (case-insensitive)', () => {
    expect(parseBearer('Bearer abc.def')).toBe('abc.def');
    expect(parseBearer('bearer   xyz  ')).toBe('xyz');
  });

  it('returns undefined for missing or malformed headers', () => {
    expect(parseBearer(undefined)).toBeUndefined();
    expect(parseBearer('Basic abc')).toBeUndefined();
    expect(parseBearer('Bearer ')).toBeUndefined();
  });
});

describe('local AuthProvider (none)', () => {
  it('resolves a full-access default context regardless of credentials', async () => {
    const provider = createLocalAuthProvider();
    const context = await provider.authenticate({ headers: {} });
    expect(context.tenantId).toBe('default');
    expect(context.permissions.has('memory:write')).toBe(true);
    expect(context.permissions.has('admin:manage')).toBe(true);
  });

  it('honors a configured tenant', async () => {
    const provider = createLocalAuthProvider({ tenantId: 'acme' });
    const context = await provider.authenticate({ headers: {} });
    expect(context.tenantId).toBe('acme');
  });
});

describe('token AuthProvider', () => {
  it('rejects a missing token with UNAUTHORIZED', async () => {
    const provider = createTokenAuthProvider({ tokenStore: createInMemoryTokenStore() });
    await expect(provider.authenticate({ headers: {} })).rejects.toSatisfy(
      (error: unknown) => error instanceof TesseraError && error.code === 'UNAUTHORIZED',
    );
  });

  it('rejects an invalid token with UNAUTHORIZED', async () => {
    const provider = createTokenAuthProvider({ tokenStore: createInMemoryTokenStore() });
    await expect(
      provider.authenticate({ authorization: 'Bearer tsk_bogus', headers: {} }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof TesseraError && error.code === 'UNAUTHORIZED',
    );
  });

  it('resolves a scoped principal for a valid token', async () => {
    const tokenStore = createInMemoryTokenStore();
    const { token } = await tokenStore.issue({
      tenantId: 'acme',
      principalId: 'ci-bot',
      roles: ['member'],
      scopes: ['search:read'],
    });
    const provider = createTokenAuthProvider({ tokenStore });
    const context = await provider.authenticate({ authorization: `Bearer ${token}`, headers: {} });

    expect(context.tenantId).toBe('acme');
    expect(context.principal.kind).toBe('token');
    expect(context.principal.id).toBe('ci-bot');
    // Least privilege: member would allow memory:write, but the scope caps it out.
    expect(context.permissions.has('search:read')).toBe(true);
    expect(context.permissions.has('memory:write')).toBe(false);
  });
});
