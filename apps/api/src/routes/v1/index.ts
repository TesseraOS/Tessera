import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ZodFastify } from '../../app-types.js';
import type { ApiServices } from '../../services.js';
import { registerSearchRoutes } from './search.js';
import { registerCompileRoutes } from './compile.js';
import { registerEffectsRoutes } from './effects.js';
import { registerMemoryRoutes } from './memory.js';

/**
 * Mount every data route under the `/v1` prefix (NFR-11: versioned, additive). Also serves the
 * generated OpenAPI document at `GET /v1/openapi.json` (`app.swagger()` is decorated by
 * `@fastify/swagger` and inherited by this child instance). Enqueued synchronously — the plugin
 * queue runs in order at boot, so never `await app.register` here.
 */
export function registerV1Routes(app: ZodFastify, services: ApiServices): void {
  app.register(
    (instance, _opts, done) => {
      const v1 = instance.withTypeProvider<ZodTypeProvider>();
      registerSearchRoutes(v1, services);
      registerCompileRoutes(v1, services);
      registerEffectsRoutes(v1, services);
      registerMemoryRoutes(v1, services);

      v1.get(
        '/openapi.json',
        { schema: { tags: ['ops'], description: 'Generated OpenAPI document.' } },
        () => app.swagger(),
      );

      done();
    },
    { prefix: '/v1' },
  );
}
