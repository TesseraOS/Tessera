/**
 * Principal primitives (FR-52, FR-55). *Who* an action is attributable to, named without depending
 * on `@tessera/api`.
 *
 * These live in `@tessera/core` for exactly the reason {@link ./tenant.js} does (ADR-0033): a domain
 * package that needs to say "this work was started by that principal" — ingestion attributing a
 * background scan, for one — must not pull in the API's auth layer to do it. The API auth model
 * re-exports {@link PrincipalKind} and remains the authority on how a *request* resolves to a
 * principal; this module only names the shape a domain event can carry.
 */

/**
 * Whether a principal is the local no-auth stand-in, an authenticated user, or an API token.
 *
 * Deliberately has **no** `system` member. A background job is not a fourth kind of principal — it
 * is work done *on behalf of* whoever started it, and that attribution is what the audit trail
 * (FR-55) records. Adding a `system` actor would let any producer write unattributable rows.
 */
export const PRINCIPAL_KINDS = ['local', 'user', 'token'] as const;
export type PrincipalKind = (typeof PRINCIPAL_KINDS)[number];

/**
 * A reference to the principal an action is attributable to — the minimum a domain event needs to
 * carry so a consumer can record who it was. Structurally identical to the audit trail's actor, so
 * one is assignable to the other without a cast.
 */
export interface PrincipalRef {
  readonly principalId: string;
  readonly kind: PrincipalKind;
}
