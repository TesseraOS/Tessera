// Governance UI helpers (F-046). The RBAC catalog (roles/permissions/role→permissions) is NO LONGER
// hand-mirrored here — it is derived from the API's `GET /v1/rbac` (the `useRbac` hook), killing the
// drift flagged in the 2026-07-04 review. Only the UI-presentation bits (audit action labels) live here.

import type { RbacCatalog } from '@/lib/api/client';
import type { AuditAction, AuditOutcome } from './api/types';

/** Role/Permission types are the API's — sourced from the generated SDK, never re-declared. */
export type Role = RbacCatalog['roles'][number];
export type Permission = RbacCatalog['permissions'][number];

/** Human labels for audit actions (presentation only; the action set is the API's — F-027/F-046). */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  search: 'Search',
  compile: 'Compile',
  'effects.read': 'Effects read',
  'memory.read': 'Memory read',
  'memory.write': 'Memory write',
  'effects.write': 'Effects write',
  'source.read': 'Source read',
  'source.manage': 'Source manage',
  'billing.read': 'Billing read',
  'billing.manage': 'Billing manage',
  'audit.read': 'Audit read',
  'token.read': 'Token read',
  'token.manage': 'Token manage',
};

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];
export const AUDIT_OUTCOMES: readonly AuditOutcome[] = ['success', 'denied'];
