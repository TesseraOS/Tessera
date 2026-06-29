import type { ApiServices } from '@tessera/api';
import type { ContextCompiler } from '@tessera/context-compiler';
import { recordCompileStageDurations } from './metrics.js';
import type { Observability } from './observability.js';
import { withSpan } from './tracing.js';

/** Wrap each method of `target` so calls run in a child span and record service-call latency. */
function traceObject<T extends object>(target: T, prefix: string, obs: Observability): T {
  return new Proxy(target, {
    get(self, property, receiver): unknown {
      const value: unknown = Reflect.get(self, property, receiver);
      if (typeof value !== 'function') return value;
      const name = `${prefix}.${String(property)}`;
      const method = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]): Promise<unknown> =>
        withSpan(name, () => {
          const start = performance.now();
          return Promise.resolve(Reflect.apply(method, self, args)).finally(() =>
            obs.instruments.serviceCallDuration.record(performance.now() - start, {
              operation: name,
            }),
          );
        });
    },
  }) as T;
}

/** Wrap the compiler: a `compile` span, service latency, and per-stage compile-latency metrics. */
function traceCompiler(compiler: ContextCompiler, obs: Observability): ContextCompiler {
  return {
    compile: (request) =>
      withSpan('compile', async () => {
        const start = performance.now();
        const pkg = await compiler.compile(request);
        obs.instruments.serviceCallDuration.record(performance.now() - start, {
          operation: 'compile',
        });
        recordCompileStageDurations(obs.instruments, pkg.trace);
        return pkg;
      }),
  };
}

/**
 * Return an {@link ApiServices} whose calls are traced (API → service spans) and timed, **without
 * modifying the domain packages** — purely an additive wrapper. The compiler additionally records
 * per-stage compile latency from the compilation trace (F-016).
 */
export function instrumentServices(services: ApiServices, obs: Observability): ApiServices {
  return {
    search: traceObject(services.search, 'search', obs),
    graph: traceObject(services.graph, 'graph', obs),
    memory: traceObject(services.memory, 'memory', obs),
    compiler: traceCompiler(services.compiler, obs),
    ...(services.readiness !== undefined ? { readiness: services.readiness } : {}),
  };
}
