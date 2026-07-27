import { createCompileBudgetClamp } from '@tessera/billing';
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
export function registerCompileRoutes(app: ZodFastify, services: ApiServices): void {
  // The token budget is capped to the caller's plan entitlement (NFR-12; F-035), through the SAME
  // clamp the MCP compile tools use (F-077) — one rule, two surfaces. A deployment that wired no
  // BillingProvider is self-hosted and unmetered, so it is NOT capped (ADR-0056); the previous
  // `?? createLocalBilling()` fallback capped self-hosted users at the cloud free tier.
  const clampBudget = createCompileBudgetClamp(services.billing);

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
