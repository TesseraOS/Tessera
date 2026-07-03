// A thin, hand-maintained mirror of the @tessera/api RBAC catalog + audit actions (ADR-0022), so the
// governance UI can render roles/permissions and action labels without bundling the API package.

import type { AuditAction, AuditOutcome } from './api/types';

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'search:read',
  'compile:read',
  'effects:read',
  'memory:read',
  'memory:write',
  'admin:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ: readonly Permission[] = ['search:read', 'compile:read', 'effects:read', 'memory:read'];

/** Role → granted permissions (mirrors ROLE_PERMISSIONS in @tessera/api). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  member: [...READ, 'memory:write'],
  viewer: READ,
};

/** Human labels for audit actions. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  search: 'Search',
  compile: 'Compile',
  'effects.read': 'Effects read',
  'memory.read': 'Memory read',
  'memory.write': 'Memory write',
  'billing.read': 'Billing read',
  'billing.manage': 'Billing manage',
  'audit.read': 'Audit read',
};

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];
export const AUDIT_OUTCOMES: readonly AuditOutcome[] = ['success', 'denied'];
