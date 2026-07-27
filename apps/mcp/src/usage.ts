import type { ProjectId, TenantId } from '@tessera/core';
import type { UsageOperation, UsageStore } from '@tessera/billing';

/** What a metered call contributes beyond its count and duration (compile only, today). */
export interface UsageAnnotation {
  readonly tokens?: number;
  readonly budgetAdherence?: number;
  readonly provenanceCoverage?: number;
}

export interface McpUsageScope {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
}

/**
 * Meter one MCP tool call (F-057; NFR-12, ADR-0060 §5).
 *
 * Wraps the **service call**, times it, and records a bucket on success.
 *
 * Applied per metered tool rather than generically inside `runTool`, because the tenant and project a
 * call belongs to are resolved *inside* each handler (`guard` then `projectOf`) — a generic wrapper
 * would have a duration and nothing to attribute it to.
 *
 * It deliberately does **not** live in `McpGateway.guard`, for two reasons that each break it:
 * a stdio deployment can run with no gateway at all and must still meter, or the agent surface is
 * invisible; and the guard runs *before* the handler, so it has no result to read a token count from.
 *
 * A throw propagates un-recorded — the same rule as the REST hook skipping `>= 400`. A failed compile
 * consumed no budget.
 */
export type McpMeter = <T>(
  operation: UsageOperation,
  scope: McpUsageScope,
  run: () => Promise<T>,
  annotate?: (value: T) => UsageAnnotation,
) => Promise<T>;

/**
 * Build the meter. With no store the result is a pass-through that still calls `run()` — so an
 * unmetered composition (including `buildMcpServer({})`) behaves exactly as it did before F-057.
 */
export function createMcpMeter(usage: UsageStore | undefined): McpMeter {
  return async <T>(
    operation: UsageOperation,
    scope: McpUsageScope,
    run: () => Promise<T>,
    annotate?: (value: T) => UsageAnnotation,
  ): Promise<T> => {
    if (usage === undefined) return run();

    const startedAt = performance.now();
    const value = await run();
    const durationMs = performance.now() - startedAt;
    const extra = annotate?.(value) ?? {};

    // Failure-isolated, exactly like the REST hook: a metering outage must never fail a tool call.
    await usage
      .record({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        operation,
        occurredAt: new Date().toISOString(),
        durationMs,
        ...(extra.tokens !== undefined ? { tokens: extra.tokens } : {}),
        ...(extra.budgetAdherence !== undefined ? { budgetAdherence: extra.budgetAdherence } : {}),
        ...(extra.provenanceCoverage !== undefined
          ? { provenanceCoverage: extra.provenanceCoverage }
          : {}),
      })
      .catch(() => {
        // Swallowed by design; the MCP surface has no request logger to warn through here.
      });

    return value;
  };
}
