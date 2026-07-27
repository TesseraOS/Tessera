import type { UsageOperation, UsageStore } from '@tessera/billing';
import type { ZodFastify } from '../app-types.js';
import { projectOf } from '../projects/selection.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Mark a route as metered (NFR-12): the onResponse hook records this operation for the tenant. */
    meter?: UsageOperation;
  }
  interface FastifyRequest {
    /** Tokens the handler actually produced — `POST /v1/compile` sets it from the package. */
    usageTokens?: number;
    /** FR-47 retrieval-quality proxies off the compiled package's `PackageScores`. */
    usageScores?: { readonly budgetAdherence: number; readonly provenanceCoverage: number };
  }
}

/**
 * Install usage metering (F-057; NFR-12, ADR-0060 §5).
 *
 * **One `onResponse` hook, marker-driven** — the same shape as the audit recorder next door, and for
 * the same reason: a per-route marker means metering is registered once and cannot be applied twice to
 * the same request. Handlers *annotate* (`request.usageTokens`), they never record; a handler that
 * recorded as well as the hook would double-count, which is asserted against rather than commented on.
 *
 * Three rules the body encodes:
 *
 * - **Recording is failure-isolated.** A store error is swallowed and logged, exactly as
 *   `recordAudit` does. A metering outage must never become a request failure — that is the same
 *   availability trade ADR-0060 §6 makes for the monthly guard, one layer down.
 * - **Responses `>= 400` are not counted.** A refused or failed compile consumed no budget, so billing
 *   for it would be charging for a 403.
 * - **Unauthenticated requests are skipped.** With no `AuthContext` there is no tenant to attribute
 *   usage to, and inventing one would put a stranger's 401 on somebody's invoice.
 */
export function recordUsage(app: ZodFastify, usage: UsageStore | undefined): void {
  if (usage === undefined) return;

  app.addHook('onResponse', (request, reply) => {
    const operation = request.routeOptions.config?.meter;
    const context = request.authContext;
    if (operation === undefined || context === undefined || context === null) {
      return Promise.resolve();
    }
    if (reply.statusCode >= 400) return Promise.resolve();

    const scores = request.usageScores;
    return usage
      .record({
        tenantId: context.tenantId,
        projectId: projectOf(request),
        operation,
        occurredAt: new Date().toISOString(),
        // Fastify measures this for us; it is the same number `apps/server` feeds the OTel histogram.
        durationMs: reply.elapsedTime,
        ...(request.usageTokens !== undefined ? { tokens: request.usageTokens } : {}),
        ...(scores !== undefined
          ? {
              budgetAdherence: scores.budgetAdherence,
              provenanceCoverage: scores.provenanceCoverage,
            }
          : {}),
      })
      .catch((error: unknown) => {
        request.log.warn({ err: error, operation }, 'usage record failed');
      });
  });
}
