import { buildServer } from '@tessera/api';
import type { Runtime } from '@tessera/config';
import { createServerRuntime, type ServerRuntimeOptions } from './bootstrap.js';

type ApiApp = ReturnType<typeof buildServer>;

export interface ApiServerOptions extends ServerRuntimeOptions {
  readonly host?: string;
  readonly port?: number;
  /** Enable Fastify's Pino logger (default off; the bin turns it on). */
  readonly logger?: boolean;
}

export interface ApiServerHandle {
  readonly runtime: Runtime;
  readonly app: ApiApp;
  /** The bound address, e.g. `http://127.0.0.1:3000`. */
  readonly url: string;
  /** Stop serving and release the runtime's handles. */
  close(): Promise<void>;
}

/**
 * Boot the Local profile and serve the REST `/v1` API (F-011). Host/port come from options then
 * `HOST`/`PORT` then defaults. Returns a handle whose `close()` stops the server and closes the
 * runtime (graceful shutdown).
 */
export async function startApiServer(options: ApiServerOptions = {}): Promise<ApiServerHandle> {
  const runtime = await createServerRuntime(options);
  const app = buildServer(runtime.services, { logger: options.logger ?? false });
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const url = await app.listen({ host, port });

  return {
    runtime,
    app,
    url,
    async close() {
      await app.close();
      await runtime.close();
    },
  };
}
