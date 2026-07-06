import { describe, expect, it } from 'vitest';
import { TesseraError, UnauthorizedError } from '@tessera/core';
import type { AuthContext, AuthProvider, Permission } from '@tessera/api';
import { createMcpGateway, defaultCredentialResolver, TOOL_PERMISSIONS } from './gateway.js';
import { createInMemoryQuotaLimiter } from './quota.js';

/** A context carrying exactly the given permissions (type-only auth import → no Fastify here). */
function contextWith(principalId: string, permissions: Permission[]): AuthContext {
  return {
    principal: { id: principalId, kind: 'token', roles: [] },
    tenantId: 'acme',
    permissions: new Set(permissions),
  };
}

function fixedProvider(context: AuthContext): AuthProvider {
  return { authenticate: () => Promise.resolve(context) };
}

const EMPTY_CALL = {};

function hasCode(code: string) {
  return (error: unknown): boolean => error instanceof TesseraError && error.code === code;
}

describe('TOOL_PERMISSIONS', () => {
  it('maps every tool to a required permission', () => {
    expect(Object.keys(TOOL_PERMISSIONS).sort()).toEqual([
      'add_source',
      'assert_effect',
      'capture_memory',
      'compile_context',
      'explain',
      'get_effects',
      'list_sources',
      'query_graph',
      'scan_source',
      'search',
    ]);
  });
});

describe('defaultCredentialResolver', () => {
  it('reads a Bearer token from the SDK authInfo', () => {
    expect(defaultCredentialResolver({ authInfo: { token: 'abc' } }).authorization).toBe(
      'Bearer abc',
    );
  });

  it('falls back to the Authorization header', () => {
    const input = defaultCredentialResolver({
      requestInfo: { headers: { authorization: 'Bearer xyz' } },
    });
    expect(input.authorization).toBe('Bearer xyz');
  });

  it('is undefined when no credential is present', () => {
    expect(defaultCredentialResolver({}).authorization).toBeUndefined();
  });
});

describe('createMcpGateway', () => {
  it('allows a tool the principal has permission for and returns the context', async () => {
    const gateway = createMcpGateway({ auth: fixedProvider(contextWith('p', ['search:read'])) });
    const context = await gateway.guard('search', EMPTY_CALL);
    expect(context.principal.id).toBe('p');
  });

  it('denies a tool the principal lacks permission for (FORBIDDEN)', async () => {
    const gateway = createMcpGateway({ auth: fixedProvider(contextWith('p', ['search:read'])) });
    await expect(gateway.guard('capture_memory', EMPTY_CALL)).rejects.toSatisfy(
      hasCode('FORBIDDEN'),
    );
  });

  it('propagates the provider’s UNAUTHORIZED for a bad/missing credential', async () => {
    const gateway = createMcpGateway({
      auth: { authenticate: () => Promise.reject(new UnauthorizedError('no token')) },
    });
    await expect(gateway.guard('search', EMPTY_CALL)).rejects.toSatisfy(hasCode('UNAUTHORIZED'));
  });

  it('enforces per-principal quota (RATE_LIMITED), independently and with window reset', async () => {
    let clock = 0;
    const quota = createInMemoryQuotaLimiter({ limit: 2, windowMs: 1000, now: () => clock });
    const reader = createMcpGateway({
      auth: fixedProvider(contextWith('reader', ['search:read'])),
      quota,
    });

    await reader.guard('search', EMPTY_CALL);
    await reader.guard('search', EMPTY_CALL);
    await expect(reader.guard('search', EMPTY_CALL)).rejects.toSatisfy(hasCode('RATE_LIMITED'));

    // A different principal shares the limiter but has its own bucket.
    const writer = createMcpGateway({
      auth: fixedProvider(contextWith('writer', ['search:read'])),
      quota,
    });
    await expect(writer.guard('search', EMPTY_CALL)).resolves.toBeDefined();

    // The window elapses → the first principal is allowed again.
    clock = 1000;
    await expect(reader.guard('search', EMPTY_CALL)).resolves.toBeDefined();
  });
});
