import { describe, expect, it } from 'vitest';
import { TesseraError, UnauthorizedError } from '@tessera/core';
import { createInMemoryAuditLog } from '@tessera/api';
import type { AuthContext, AuthProvider, Permission } from '@tessera/api';
import {
  createMcpGateway,
  defaultCredentialResolver,
  MCP_AUDIT_ACTIONS,
  TOOL_PERMISSIONS,
} from './gateway.js';
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
      'get_stats',
      'issue_token',
      'list_sources',
      'list_tokens',
      'query_graph',
      'revoke_token',
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

describe('MCP_AUDIT_ACTIONS', () => {
  it('maps every guarded tool to an audit action from the existing REST taxonomy', () => {
    expect(Object.keys(MCP_AUDIT_ACTIONS).sort()).toEqual(Object.keys(TOOL_PERMISSIONS).sort());
  });
});

describe('createMcpGateway audit recording (F-047 — closes the F-027 seam)', () => {
  it('records an authorized call with actor, tenant, tool and action', async () => {
    const audit = createInMemoryAuditLog();
    const gateway = createMcpGateway({
      auth: fixedProvider(contextWith('agent-1', ['memory:write'])),
      audit,
    });

    await gateway.guard('capture_memory', EMPTY_CALL);

    const { events } = await audit.forTenant('acme').query();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: 'acme',
      actor: { principalId: 'agent-1', kind: 'token' },
      action: 'memory.write', // the same action REST records — one trail, two surfaces
      target: 'capture_memory',
      outcome: 'success',
      metadata: { surface: 'mcp' },
    });
  });

  it('records a permission denial as `denied` (the identity is known)', async () => {
    const audit = createInMemoryAuditLog();
    const gateway = createMcpGateway({
      auth: fixedProvider(contextWith('agent-1', ['search:read'])),
      audit,
    });

    await expect(gateway.guard('capture_memory', EMPTY_CALL)).rejects.toSatisfy(
      hasCode('FORBIDDEN'),
    );

    const { events } = await audit.forTenant('acme').query();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'memory.write', outcome: 'denied' });
  });

  it('records a quota refusal as `denied`', async () => {
    const audit = createInMemoryAuditLog();
    const gateway = createMcpGateway({
      auth: fixedProvider(contextWith('agent-1', ['search:read'])),
      quota: createInMemoryQuotaLimiter({ limit: 1, windowMs: 1000, now: () => 0 }),
      audit,
    });

    await gateway.guard('search', EMPTY_CALL);
    await expect(gateway.guard('search', EMPTY_CALL)).rejects.toSatisfy(hasCode('RATE_LIMITED'));

    const outcomes = (await audit.forTenant('acme').query()).events.map((e) => e.outcome);
    expect(outcomes).toEqual(expect.arrayContaining(['success', 'denied']));
    expect(outcomes).toHaveLength(2);
  });

  it('records nothing for an unauthenticated call — no identity means no tenant to attribute it to', async () => {
    const audit = createInMemoryAuditLog();
    const gateway = createMcpGateway({
      auth: { authenticate: () => Promise.reject(new UnauthorizedError('no token')) },
      audit,
    });

    await expect(gateway.guard('search', EMPTY_CALL)).rejects.toSatisfy(hasCode('UNAUTHORIZED'));
    expect((await audit.forTenant('acme').query()).events).toEqual([]);
  });

  it('isolates sink failures — a broken audit log never fails a tool call', async () => {
    const gateway = createMcpGateway({
      auth: fixedProvider(contextWith('agent-1', ['search:read'])),
      audit: {
        record: () => Promise.reject(new Error('sink down')),
        query: () => Promise.resolve({ events: [] }),
        prune: () => Promise.resolve(0),
        forTenant() {
          return this;
        },
      },
    });

    await expect(gateway.guard('search', EMPTY_CALL)).resolves.toBeDefined();
  });
});
