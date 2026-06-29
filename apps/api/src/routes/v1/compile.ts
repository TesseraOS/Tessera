import type { CompileRequest } from '@tessera/context-compiler';
import type { ZodFastify } from '../../app-types.js';
import type { ApiServices } from '../../services.js';
import {
  compileBodySchema,
  contextPackageSchema,
  type CompileBody,
} from '../../schemas/compile.js';

/** `POST /v1/compile` — compile a provenance-tagged, budget-bounded Context Package (F-010). */
export function registerCompileRoutes(app: ZodFastify, services: ApiServices): void {
  app.post<{ Body: CompileBody }>(
    '/compile',
    {
      schema: {
        tags: ['compile'],
        summary: 'Compile context for a task within a token budget.',
        body: compileBodySchema,
        response: { 200: contextPackageSchema },
      },
    },
    (request) => {
      const { task, budget, retrievalLimit, filters } = request.body;
      const compileRequest: CompileRequest = {
        task,
        budget,
        ...(retrievalLimit !== undefined ? { retrievalLimit } : {}),
        ...(filters !== undefined
          ? { filters: filters.kinds !== undefined ? { kinds: filters.kinds } : {} }
          : {}),
      };
      return services.compiler.compile(compileRequest);
    },
  );
}
