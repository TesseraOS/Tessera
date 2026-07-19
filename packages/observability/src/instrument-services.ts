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
      // `forTenant` (FR-52) / `forProject` (FR-66) return a scoped view synchronously — re-wrap it
      // (keep tracing on the scoped service) rather than treating it as an async service call that
      // returns a Promise.
      if (property === 'forTenant' || property === 'forProject') {
        const scope = value as (scopeId: string) => T;
        return (scopeId: string): T =>
          traceObject(Reflect.apply(scope, self, [scopeId]) as T, prefix, obs);
      }
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
    // Data-plane isolation (FR-52/FR-66): a scoped compiler stays instrumented.
    forTenant: (tenantId) => traceCompiler(compiler.forTenant(tenantId), obs),
    forProject: (projectId) => traceCompiler(compiler.forProject(projectId), obs),
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
    // Optional ApiServices members MUST be forwarded — dropping one silently 500s its routes on the
    // instrumented (shipped) server. `sources` (F-038) is traced like the others; `billing` (F-030) is
    // passed through untraced because its methods are synchronous (e.g. `[...listPlans()]`) and must
    // not be Promise-wrapped by the tracing Proxy.
    ...(services.sources !== undefined
      ? { sources: traceObject(services.sources, 'sources', obs) }
      : {}),
    ...(services.billing !== undefined ? { billing: services.billing } : {}),
    ...(services.readiness !== undefined ? { readiness: services.readiness } : {}),
  };
}
