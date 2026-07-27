import { RateLimitedError, type TenantId } from '@tessera/core';
import type { EntitlementContext } from '../budget.js';
import { effectiveEntitlements } from '../domain.js';
import { usageMonthResetAt, usageMonthWindow } from './period.js';
import type { UsageStore } from './ports.js';

/**
 * Refuse a compile once the tenant has spent its plan's monthly entitlement (NFR-12; ADR-0060 §6).
 *
 * Called per compile, **before** the budget clamp: refuse first, then cap. Resolves for an allowed
 * compile and throws {@link RateLimitedError} for a refused one.
 */
export type MonthlyCompileGuard = (tenantId: TenantId) => Promise<void>;

export interface MonthlyCompileGuardOptions extends EntitlementContext {
  /** Where compiles are counted. Absent ⇒ nothing to count against, so nothing is refused. */
  readonly usage?: UsageStore;
  /** Clock seam, so a test can stand at a month boundary without waiting for one. */
  readonly now?: () => Date;
}

/**
 * The **F-035 closure**. `maxMonthlyCompiles` has been in the plan catalog since F-030 and was read
 * by nothing: a workspace grep returned the definition, one unit assertion, marketing copy, and two
 * dashboard *display* sites. A Free-plan tenant could compile without limit, forever.
 *
 * Built once here and consumed by `POST /v1/compile` **and** the MCP `compile_context` / `explain`
 * tools, for the reason ADR-0056 §4 makes standing: an entitlement rule with two implementations
 * drifts, and the surface that gets forgotten is the agent one (F-077 exists because MCP never had a
 * clamp at all).
 *
 * Three behaviours are decisions, not defaults:
 *
 * - **Counted per TENANT, across every project.** A subscription is per-tenant, so scoping the count
 *   to a project would let a tenant mint unlimited compiles by minting projects.
 * - **`-1` is unlimited.** The sentinel is checked before any comparison; a plain numeric compare
 *   would refuse enterprise tenants at zero compiles.
 * - **It fails OPEN.** If the usage store (or the provider) is unreachable, the compile is served. A
 *   metering outage that becomes a product outage is worse than a few uncounted compiles. This is a
 *   deliberate cost leak, recorded in ADR-0060 §6 rather than hidden — and it is the same trade the
 *   metering recorders make one layer down.
 */
export function createMonthlyCompileGuard(
  options: MonthlyCompileGuardOptions = {},
): MonthlyCompileGuard {
  const { billing, usage, metered = false, now = () => new Date() } = options;

  if (billing === undefined || usage === undefined || !metered) {
    return () => Promise.resolve();
  }

  return async (tenantId: TenantId): Promise<void> => {
    // Resolved inside the try so a store or provider fault falls through to "allow"; the refusal
    // itself is thrown OUTSIDE it, or the guard would swallow its own decision.
    let refusal: RateLimitedError | undefined;
    try {
      const entitlements = effectiveEntitlements(await billing.getSubscription(tenantId));
      const limit = entitlements.maxMonthlyCompiles;
      if (limit < 0) return;

      const at = now().toISOString();
      const window = usageMonthWindow(at);
      const aggregates = await usage.summarize({
        tenantId,
        from: window.from,
        until: window.until,
        operations: ['compile'],
      });
      const used = aggregates.reduce((total, aggregate) => total + aggregate.count, 0);

      if (used >= limit) {
        refusal = new RateLimitedError(
          `monthly compile entitlement reached (${String(used)}/${String(limit)})`,
          { details: { limit, used, resetAt: usageMonthResetAt(at) } },
        );
      }
    } catch {
      // Fail open — see the doc comment. Deliberately not rethrown and deliberately not logged here:
      // this package has no logger, and the surfaces that call it do.
      return;
    }

    if (refusal !== undefined) throw refusal;
  };
}
