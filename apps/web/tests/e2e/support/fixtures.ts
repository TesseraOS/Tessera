import { test as base, expect } from '@playwright/test';

/**
 * The zero-auth local identity every view e2e runs as (F-045). The view specs stub their own data at
 * the network boundary (ADR-0022); this stubs `GET /v1/me` so the session resolves to Local — the app
 * renders its normal chrome and never redirects to sign-in. The real token-mode flow is covered
 * separately by `auth.spec.ts` (which imports `@playwright/test` directly, without this stub).
 */
export const LOCAL_IDENTITY = {
  principal: { id: 'local', kind: 'local', displayName: 'Local (no auth)', roles: ['owner'] },
  tenantId: 'default',
  permissions: [
    'search:read',
    'compile:read',
    'effects:read',
    'memory:read',
    'memory:write',
    'effects:write',
    'sources:read',
    'sources:manage',
    'admin:manage',
  ],
};

/** The RBAC catalog the governance view derives from `/v1/rbac` (F-046). */
export const LOCAL_RBAC = {
  roles: ['owner', 'admin', 'member', 'viewer'],
  permissions: [
    'search:read',
    'compile:read',
    'effects:read',
    'memory:read',
    'memory:write',
    'effects:write',
    'sources:read',
    'sources:manage',
    'admin:manage',
  ],
  rolePermissions: {
    owner: [
      'search:read',
      'compile:read',
      'effects:read',
      'memory:read',
      'memory:write',
      'effects:write',
      'sources:read',
      'sources:manage',
      'admin:manage',
    ],
    admin: [
      'search:read',
      'compile:read',
      'effects:read',
      'memory:read',
      'memory:write',
      'effects:write',
      'sources:read',
      'sources:manage',
      'admin:manage',
    ],
    member: [
      'search:read',
      'compile:read',
      'effects:read',
      'memory:read',
      'memory:write',
      'effects:write',
      'sources:manage',
    ],
    viewer: ['search:read', 'compile:read', 'effects:read', 'memory:read', 'sources:read'],
  },
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/v1/me', (route) => route.fulfill({ json: LOCAL_IDENTITY }));
    await page.route('**/v1/rbac', (route) => route.fulfill({ json: LOCAL_RBAC }));
    await use(page);
  },
});

export { expect };
