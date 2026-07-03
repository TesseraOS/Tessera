import { describe, expect, it } from 'vitest';
import {
  buildAuthContext,
  createLocalAuthContext,
  DEFAULT_TENANT_ID,
  effectivePermissions,
  hasPermission,
  permissionsForRoles,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Principal,
} from './model.js';

describe('RBAC model', () => {
  it('grants owner and admin every permission', () => {
    expect(new Set(ROLE_PERMISSIONS.owner)).toEqual(new Set(PERMISSIONS));
    expect(new Set(ROLE_PERMISSIONS.admin)).toEqual(new Set(PERMISSIONS));
  });

  it('grants member reads + memory:write but not admin:manage', () => {
    const member = permissionsForRoles(['member']);
    expect(member.has('memory:write')).toBe(true);
    expect(member.has('search:read')).toBe(true);
    expect(member.has('admin:manage')).toBe(false);
  });

  it('grants viewer read-only (no writes, no admin)', () => {
    const viewer = permissionsForRoles(['viewer']);
    expect(viewer.has('search:read')).toBe(true);
    expect(viewer.has('memory:read')).toBe(true);
    expect(viewer.has('memory:write')).toBe(false);
    expect(viewer.has('admin:manage')).toBe(false);
  });

  it('unions permissions across multiple roles', () => {
    const combined = permissionsForRoles(['viewer', 'member']);
    expect(combined.has('memory:write')).toBe(true);
  });

  it('intersects roles with token scopes (least privilege)', () => {
    // A member is granted memory:write, but this token is scoped to reads only.
    const scopedToken: Principal = {
      id: 'tok-1',
      kind: 'token',
      roles: ['member'],
      scopes: ['search:read', 'memory:read'],
    };
    const effective = effectivePermissions(scopedToken);
    expect(effective.has('search:read')).toBe(true);
    expect(effective.has('memory:read')).toBe(true);
    // Scoped out even though the role would allow it.
    expect(effective.has('memory:write')).toBe(false);
  });

  it('never lets a scope exceed the roles that back it', () => {
    // The token is scoped to admin:manage, but a viewer role does not grant it → still denied.
    const overscoped: Principal = {
      id: 'tok-2',
      kind: 'token',
      roles: ['viewer'],
      scopes: ['admin:manage'],
    };
    expect(effectivePermissions(overscoped).has('admin:manage')).toBe(false);
  });

  it('builds a context whose permission check reflects effective permissions', () => {
    const context = buildAuthContext({ id: 'u', kind: 'user', roles: ['viewer'] }, 'acme');
    expect(context.tenantId).toBe('acme');
    expect(hasPermission(context, 'search:read')).toBe(true);
    expect(hasPermission(context, 'memory:write')).toBe(false);
  });

  it('local context is full-access in the default tenant', () => {
    const context = createLocalAuthContext();
    expect(context.tenantId).toBe(DEFAULT_TENANT_ID);
    for (const permission of PERMISSIONS) {
      expect(hasPermission(context, permission)).toBe(true);
    }
  });
});
