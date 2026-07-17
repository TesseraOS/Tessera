import {
  MAX_AUDIT_EXPORT_ROWS,
  MAX_AUDIT_PAGE_SIZE,
  type AuditEvent,
  type AuditQuery,
} from './model.js';
import type { AuditLog } from './port.js';

/** The filters an export may narrow by — {@link AuditQuery} without its paging controls. */
export type AuditTrailFilters = Omit<AuditQuery, 'limit' | 'cursor'>;

export interface CollectedAuditTrail {
  readonly events: readonly AuditEvent[];
  /** True when the cap stopped the walk before the trail ran out. Say so; never imply completeness. */
  readonly truncated: boolean;
}

/**
 * Page an entire audit trail, following `nextCursor` to completeness (F-047, F-063).
 *
 * **Why a loop and not one big `limit`.** `AuditLog.query` is paginated *by contract*, so any caller
 * that reads one page and calls it "the trail" is wrong about what the trail is. Completeness is a
 * fact about the data, which is why it belongs here on the server and cannot be delegated to a client
 * that has loaded 2 of 40 pages. The cursor is opaque and strictly forward, so this terminates.
 *
 * **The cap is deliberate.** DSR's walk was unbounded, which is defensible for a rare right-of-access
 * request; an export *button* is not rare, and an unbounded materialization on an admin route is a
 * latent OOM. `truncated` makes the bound honest rather than silent — the caller is told, and can
 * narrow the range. Pass `cap: undefined` to keep the DSR behaviour of walking everything.
 *
 * `auditLog` must already be `forTenant`-scoped by the caller: this walks whatever it is handed, and
 * a cross-tenant export would be invisible here.
 */
export async function collectAuditTrail(
  auditLog: AuditLog,
  filters: AuditTrailFilters = {},
  cap: number | undefined = MAX_AUDIT_EXPORT_ROWS,
): Promise<CollectedAuditTrail> {
  const events: AuditEvent[] = [];
  let cursor: string | undefined;

  do {
    const page = await auditLog.query({
      ...filters,
      // Pinned rather than left to the adapter's default: this calls the PORT directly, below the
      // route schema that would otherwise clamp it (and the two adapters disagree about clamping —
      // see the conformance case that now covers it).
      limit: MAX_AUDIT_PAGE_SIZE,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    events.push(...page.events);
    cursor = page.nextCursor;

    if (cap !== undefined && events.length >= cap) {
      // More pages remain, so the answer is a prefix of the trail, not the trail.
      return {
        events: events.slice(0, cap),
        truncated: cursor !== undefined || events.length > cap,
      };
    }
  } while (cursor !== undefined);

  return { events, truncated: false };
}
