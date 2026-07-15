import type { Identity } from '@tessera/sdk';

export type { Identity };

/**
 * Name of the **httpOnly** cookie holding the API bearer token (ADR-0048). It is set/cleared only by
 * the `/api/auth/session` route and read only server-side by the proxy — never exposed to client JS.
 */
export const SESSION_COOKIE = 'tessera_session';

/**
 * Same-origin base the browser uses to reach the Tessera API through the Next proxy (ADR-0048). The
 * proxy attaches the bearer from {@link SESSION_COOKIE} server-side, so no token ever reaches the SPA.
 */
export const PROXY_BASE = '/api/tessera';

/** The `/api/auth/session` endpoint (sign-in POST / sign-out DELETE). */
export const SESSION_ENDPOINT = '/api/auth/session';

/** Whether a principal is the zero-auth local stand-in (vs a real authenticated user/token). */
export function isLocalIdentity(identity: Identity | null): boolean {
  return identity?.principal.kind === 'local';
}
