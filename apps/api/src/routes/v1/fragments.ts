import type { FragmentSource } from '@tessera/context-compiler';
import { InternalError, NotFoundError } from '@tessera/core';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { projectOf } from '../../projects/selection.js';
import type { ApiServices } from '../../services.js';
import {
  fragmentRefParamSchema,
  fragmentResponseSchema,
  MAX_FRAGMENT_TEXT_CHARS,
  type FragmentRefParam,
  type FragmentResponse,
} from '../../schemas/fragments.js';

function requireFragments(services: ApiServices): FragmentSource {
  if (services.fragments === undefined) {
    throw new InternalError('the corpus is not configured for this deployment');
  }
  return services.fragments;
}

function readPath(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const value = metadata?.['path'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * `GET /v1/fragments/:ref` — the body behind a search hit (F-075).
 *
 * **The reason this route could not exist before.** Refs are `sha256(sourceId:path)`: derivable, not
 * secret. Until F-075/ADR-0067 the corpus had one global key space, so serving a body by ref would
 * have been a cross-tenant IDOR — authenticated and unauthorized. F-061 shipped the search detail
 * Sheet with an excerpt instead, and said so.
 *
 * **Why the 404 is structural rather than an `if`.** The lookup goes through a `(tenant, project)`-
 * scoped {@link FragmentSource}, and there is no second, unscoped read to compare it against. So a
 * ref belonging to another tenant is indistinguishable from a ref that never existed — not by
 * policy, but because this handler has no way to learn the difference. A later edit cannot leak
 * existence here without first adding an unscoped read that does not exist.
 */
export function registerFragmentRoutes(app: ZodFastify, services: ApiServices): void {
  app.get<{ Params: FragmentRefParam }>(
    '/fragments/:ref',
    {
      preHandler: requirePermission('fragments:read'),
      schema: {
        tags: ['fragments'],
        summary: 'Read the stored body of one corpus fragment by ref.',
        params: fragmentRefParamSchema,
        response: { 200: fragmentResponseSchema },
      },
      // A full-content read is the most sensitive read in the product (NFR-13). The `.read` suffix
      // keeps it out of the activity chart and the recent-activity feed by the existing mechanical
      // rule — a body fetch per opened search result must not read as a spike in work done.
      config: { audit: 'fragment.read' },
    },
    async (request): Promise<FragmentResponse> => {
      const { ref } = request.params;
      const fragment = await requireFragments(services)
        .forTenant(tenantOf(request))
        .forProject(projectOf(request))
        .get(ref);

      if (fragment === undefined) {
        throw new NotFoundError('fragment not found', { details: { ref } });
      }

      const truncated = fragment.text.length > MAX_FRAGMENT_TEXT_CHARS;
      const path = readPath(fragment.metadata);
      return {
        ref: fragment.ref,
        kind: fragment.kind,
        text: truncated ? fragment.text.slice(0, MAX_FRAGMENT_TEXT_CHARS) : fragment.text,
        ...(path !== undefined ? { path } : {}),
        truncated,
      };
    },
  );
}
