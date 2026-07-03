import type { FastifyRequest } from 'fastify';
import type { ZodFastify } from '../app-types.js';
import type { AuditAction, AuditOutcome } from './model.js';
import type { AuditLog } from './port.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Mark a route as audited (FR-55): the onResponse hook records this action for the trail. */
    audit?: AuditAction;
  }
}

/** A non-sensitive target for the event: a known id param, else the route pattern (never content). */
function auditTarget(request: FastifyRequest): string | undefined {
  const params = request.params as Record<string, unknown> | undefined;
  const lineageId = params?.['lineageId'];
  if (typeof lineageId === 'string') return lineageId;
  return request.routeOptions.url;
}

/**
 * Install audit recording (FR-55, NFR-13; ADR-0034). An `onResponse` hook records an
 * {@link import('./model.js').AuditEvent} for every route flagged with an `audit` action in its route
 * config: actor + tenant come from the resolved {@link import('../auth/model.js').AuthContext}, and the
 * outcome from the status code (`>= 400` → `denied`, e.g. a 403 from an RBAC guard). Recording is
 * **best-effort and failure-isolated** — a sink error is swallowed (logged) and never affects the
 * response. Unauthenticated requests (no AuthContext, e.g. a 401) are skipped: they can't be attributed
 * to a tenant.
 */
export function recordAudit(app: ZodFastify, auditLog: AuditLog): void {
  app.addHook('onResponse', (request, reply) => {
    const action = request.routeOptions.config?.audit;
    const context = request.authContext;
    if (action === undefined || context === undefined || context === null) {
      return Promise.resolve();
    }
    const outcome: AuditOutcome = reply.statusCode >= 400 ? 'denied' : 'success';
    const target = auditTarget(request);
    return auditLog
      .forTenant(context.tenantId)
      .record({
        tenantId: context.tenantId,
        actor: { principalId: context.principal.id, kind: context.principal.kind },
        action,
        ...(target !== undefined ? { target } : {}),
        outcome,
      })
      .catch((error: unknown) => {
        request.log.warn({ err: error, action }, 'audit record failed');
      });
  });
}
