import type { MemoryRetentionPolicy } from '@tessera/memory';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { tenantProjectIds } from '../../projects/enumerate.js';
import {
  retentionPolicyResponseSchema,
  retentionPruneResponseSchema,
} from '../../schemas/retention.js';
import type { ApiServices } from '../../services.js';

/**
 * `/v1/retention` — memory retention/expiry (FR-15; F-047). The policy is **config-driven** (the
 * deployment's `memory.retention`, resolved onto the runtime) — this surface reads it and applies it;
 * mutating the policy at runtime is deliberately not offered (config is the source of truth), a
 * documented seam.
 *
 * `GET` returns the effective policy (`admin:manage`, audited `retention.read`). `POST /prune` runs the
 * pass over the **caller's own tenant, across every project** (`admin:manage`, audited
 * `retention.manage`): the policy is a tenant-wide lifecycle rule, so a bare `forTenant` view (default
 * project only) would leave other projects' aged memory unpruned. Retention only deletes — expired
 * lineages and already-superseded versions — so FR-12's never-silently-mutate contract is untouched.
 * Running the pass on a schedule is a seam: this route is the trigger.
 */
export function registerRetentionRoutes(
  app: ZodFastify,
  services: ApiServices,
  policy: MemoryRetentionPolicy,
): void {
  const scoped = app.withTypeProvider<ZodTypeProvider>();

  scoped.get(
    '/retention',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['retention'],
        summary:
          "The deployment's effective memory retention policy (empty rules ⇒ retention off).",
        response: { 200: retentionPolicyResponseSchema },
      },
      config: { audit: 'retention.read' },
    },
    () => ({ rules: policy.rules.map((rule) => ({ ...rule })) }),
  );

  scoped.post(
    '/retention/prune',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['retention'],
        summary:
          "Apply the retention policy to the calling tenant's memories; returns what was pruned.",
        response: { 200: retentionPruneResponseSchema },
      },
      config: { audit: 'retention.manage' },
    },
    async (request) => {
      const tenantId = tenantOf(request);
      const projectIds = await tenantProjectIds(services.projects, tenantId);
      let expiredLineages = 0;
      let prunedVersions = 0;
      for (const projectId of projectIds) {
        const result = await services.memory
          .forTenant(tenantId)
          .forProject(projectId)
          .prune(policy);
        expiredLineages += result.expiredLineages;
        prunedVersions += result.prunedVersions;
      }
      return { expiredLineages, prunedVersions };
    },
  );
}
