import {
  createCompileBudgetClamp,
  createMonthlyCompileGuard,
  type UsageStore,
} from '@tessera/billing';
import type { CompileRequest } from '@tessera/context-compiler';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { projectOf } from '../../projects/selection.js';
import type { ApiServices } from '../../services.js';
import {
  compileBodySchema,
  contextPackageSchema,
  type CompileBody,
} from '../../schemas/compile.js';

/** `POST /v1/compile` — compile a provenance-tagged, budget-bounded Context Package (F-010). */
export function registerCompileRoutes(
  app: ZodFastify,
  services: ApiServices,
  metered = false,
  usage?: UsageStore,
): void {
  // The monthly compile entitlement (F-035's closure; NFR-12) — the same single implementation the
  // MCP compile tools call. Runs BEFORE the clamp: refuse first, then cap.
  const guardMonthly = createMonthlyCompileGuard({
    ...(services.billing !== undefined ? { billing: services.billing } : {}),
    ...(usage !== undefined ? { usage } : {}),
    metered,
  });
  // The token budget is capped to the caller's plan entitlement (NFR-12; F-035), through the SAME
  // clamp the MCP compile tools use (F-077) — one rule, two surfaces.
  //
  // `metered` is an explicit flag, not `services.billing !== undefined` (ADR-0060 §1): the
  // composition root ALWAYS wires a provider, so the old predicate capped every Local and
  // self-hosted deployment at the cloud free tier's 8000 tokens — which is what ADR-0056 §3 decided
  // must not happen and believed it had prevented.
  const clampBudget = createCompileBudgetClamp({
    ...(services.billing !== undefined ? { billing: services.billing } : {}),
    metered,
  });

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
      config: { audit: 'compile', meter: 'compile' },
    },
    async (request) => {
      const tenantId = tenantOf(request);
      // Refuse before capping (ADR-0060 §6): a tenant past its monthly entitlement gets a 429, not a
      // silently smaller package. The 429 response is `>= 400`, so the metering hook skips it and a
      // refusal cannot inflate the count that caused it.
      await guardMonthly(tenantId);
      const { task, budget, retrievalLimit, filters } = request.body;
      const compileRequest: CompileRequest = {
        task,
        budget: await clampBudget(tenantId, budget),
        ...(retrievalLimit !== undefined ? { retrievalLimit } : {}),
        ...(filters !== undefined
          ? { filters: filters.kinds !== undefined ? { kinds: filters.kinds } : {} }
          : {}),
      };
      // Data-plane isolation (FR-52/FR-66): compile against only the caller's (tenant, project) corpus/graph.
      const pkg = await services.compiler
        .forTenant(tenantId)
        .forProject(projectOf(request))
        .compile(compileRequest);

      // Annotate for the metering hook (ADR-0060 §5) — the handler never records. `scores` is what
      // FR-47's retrieval-quality proxies are made of; the compiler already computes it, so analytics
      // costs an accumulation rather than a second pass over the package.
      request.usageTokens = pkg.totalTokens;
      request.usageScores = {
        budgetAdherence: pkg.scores.budgetAdherence,
        provenanceCoverage: pkg.scores.provenanceCoverage,
      };
      return pkg;
    },
  );
}
