import type { ZodFastify } from '../app-types.js';

/**
 * Security-header hardening (NFR-2). The API serves JSON only (no HTML/Swagger UI), so a strict
 * Content-Security-Policy is safe and framing is always denied. Applied as an explicit `onRequest`
 * hook rather than pulling in `@fastify/helmet` — the sanctioned no-new-dependency option; the same
 * map is reused by the SSE `writeHead` (which bypasses the normal reply lifecycle).
 */

export interface SecurityHeadersOptions {
  /**
   * Emit `Strict-Transport-Security` (HSTS). Only meaningful when the API is reached over TLS
   * (directly or behind a TLS-terminating proxy) — enabling it on a plain-HTTP origin would tell
   * browsers to refuse the site. Off by default; hosted/TLS profiles turn it on.
   */
  readonly hsts?: boolean;
  /** `max-age` seconds for HSTS (default 180 days). Ignored when `hsts` is false. */
  readonly hstsMaxAgeSeconds?: number;
}

/** Default HSTS max-age (180 days) — long enough to matter, short enough to back out of. */
const DEFAULT_HSTS_MAX_AGE = 15_552_000;

/**
 * Build the static security-header map for the given options. Pure and exhaustively unit-tested so
 * both the global hook and the SSE handler emit identical headers.
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {
    // JSON API: nothing should be loaded, and the response must never be framed.
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    // Belt-and-suspenders framing denial for pre-CSP user agents.
    'x-frame-options': 'DENY',
    // Never let a browser MIME-sniff a JSON body into something executable.
    'x-content-type-options': 'nosniff',
    // Do not leak URLs (which can carry ids) to third parties.
    'referrer-policy': 'no-referrer',
  };
  if (options.hsts === true) {
    const maxAge = options.hstsMaxAgeSeconds ?? DEFAULT_HSTS_MAX_AGE;
    headers['strict-transport-security'] = `max-age=${maxAge}; includeSubDomains`;
  }
  return headers;
}

/**
 * Install security headers on every response. An `onRequest` hook sets them early so they persist
 * through normal responses **and** error-envelope responses; hijacked routes (SSE) reuse
 * {@link securityHeaders} directly in their `writeHead`.
 */
export function registerSecurityHeaders(
  app: ZodFastify,
  options: SecurityHeadersOptions = {},
): void {
  const headers = securityHeaders(options);
  app.addHook('onRequest', (_request, reply, done) => {
    for (const [name, value] of Object.entries(headers)) {
      reply.header(name, value);
    }
    done();
  });
}
