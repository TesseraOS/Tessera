import {
  clampBudgetToPlan,
  createLocalBilling,
  effectiveEntitlements,
  type BillingProvider,
} from '@tessera/billing';
import type { CompileRequest } from '@tessera/context-compiler';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import type { ApiServices } from '../../services.js';
import {
  compileBodySchema,
  contextPackageSchema,
  type CompileBody,
} from '../../schemas/compile.js';

/** `POST /v1/compile` — compile a provenance-tagged, budget-bounded Context Package (F-010). */
export function registerCompileRoutes(app: ZodFastify, services: ApiServices): void {
  // The token budget is capped to the caller's plan entitlement (NFR-12; F-035). Falls back to the
  // local/free adapter when no billing is wired, so free-tier limits apply by default.
  const billing: BillingProvider = services.billing ?? createLocalBilling();

  app.post<{ Body: CompileBody }>(
    '/compile',
    {
      preHandler: requirePermission('compile:read'),
      schema: {
        tags: ['compile'],
        summary: 'Compile context for a task within a token budget (capped to the plan).',
        body: compileBodySchema,
        response: { 200: contextPackageSchema },
      },
      config: { audit: 'compile' },
    },
    async (request) => {
      const tenantId = tenantOf(request);
      const entitlements = effectiveEntitlements(await billing.getSubscription(tenantId));
      const { task, budget, retrievalLimit, filters } = request.body;
      const compileRequest: CompileRequest = {
        task,
        budget: clampBudgetToPlan(entitlements, budget),
        ...(retrievalLimit !== undefined ? { retrievalLimit } : {}),
        ...(filters !== undefined
          ? { filters: filters.kinds !== undefined ? { kinds: filters.kinds } : {} }
          : {}),
      };
      // Data-plane isolation (FR-52): compile against only the caller-tenant's corpus/graph.
      return services.compiler.forTenant(tenantId).compile(compileRequest);
    },
  );
}
