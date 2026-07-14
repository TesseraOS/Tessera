import { RateLimitedError, ValidationError } from '@tessera/core';
import type { FastifyRequest } from 'fastify';
import type { ZodFastify } from '../app-types.js';

/**
 * Per-principal (fallback per-IP) request rate limiting on `/v1` (NFR-1/NFR-2). Mirrors the F-026
 * MCP-gateway `QuotaLimiter` pattern: a small port + an in-memory fixed-window adapter (the Local
 * adapter); a distributed/persistent limiter (Redis, etc.) is a documented seam. Denials surface as
 * the standard `RATE_LIMITED` 429 envelope with `RateLimit-*` headers, so no route code changes.
 */

export interface RateLimitDecision {
  /** Whether this request is within the current window's limit. */
  readonly allowed: boolean;
  /** The per-window limit. */
  readonly limit: number;
  /** Requests remaining in the current window after this decision (never negative). */
  readonly remaining: number;
  /** Epoch-ms when the current window resets. */
  readonly resetAt: number;
}

export interface RateLimiter {
  /**
   * Account for one request by `key` in the current window and return the decision. Pure of I/O and
   * non-throwing — the hook decides how to surface a denial.
   */
  consume(key: string): RateLimitDecision;
}

export interface InMemoryRateLimitOptions {
  /** Max requests allowed per key per window (> 0). */
  readonly limit: number;
  /** Window length in ms (> 0). */
  readonly windowMs: number;
  /** Injected clock (epoch ms) for deterministic tests. */
  readonly now?: () => number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * A fixed-window per-key limiter: each key may make `limit` requests per `windowMs`; the window
 * resets on the first request after it elapses. Independent buckets per key.
 */
export function createInMemoryRateLimiter(options: InMemoryRateLimitOptions): RateLimiter {
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new ValidationError('rate-limit limit must be a positive number');
  }
  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
    throw new ValidationError('rate-limit windowMs must be a positive number');
  }
  const { limit, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  return {
    consume(key) {
      const t = now();
      let bucket = buckets.get(key);
      if (bucket === undefined || t - bucket.windowStart >= windowMs) {
        bucket = { count: 0, windowStart: t };
        buckets.set(key, bucket);
      }
      const resetAt = bucket.windowStart + windowMs;
      if (bucket.count >= limit) {
        return { allowed: false, limit, remaining: 0, resetAt };
      }
      bucket.count += 1;
      return { allowed: true, limit, remaining: limit - bucket.count, resetAt };
    },
  };
}

/**
 * The rate-limit key for a request: the resolved principal (per-principal limiting) when
 * authenticated, else the client IP (fallback). Tenant is folded in so principals in different
 * tenants never share a bucket.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const context = request.authContext;
  if (context !== undefined && context !== null) {
    return `principal:${context.tenantId}:${context.principal.id}`;
  }
  return `ip:${request.ip}`;
}

export interface RegisterRateLimitOptions {
  /** The limiter to meter against. */
  readonly limiter: RateLimiter;
  /** Key function (default {@link rateLimitKey}). */
  readonly keyOf?: (request: FastifyRequest) => string;
}

/** Seconds until `resetAt` from now, floored at 0 (for `RateLimit-Reset` / `Retry-After`). */
function resetSeconds(resetAt: number, now: number): number {
  return Math.max(0, Math.ceil((resetAt - now) / 1000));
}

/**
 * Install rate limiting on a route group. Registered **after** auth so the key can use the resolved
 * `request.authContext`. Emits IETF `RateLimit-Limit/Remaining/Reset` on every request and, on
 * denial, `Retry-After` + throws {@link RateLimitedError} (→ 429 `{error}` envelope). Setting the
 * headers on the reply before throwing means the error response carries them too.
 */
export function registerRateLimit(app: ZodFastify, options: RegisterRateLimitOptions): void {
  const keyOf = options.keyOf ?? rateLimitKey;
  app.addHook('onRequest', (request, reply, done) => {
    const decision = options.limiter.consume(keyOf(request));
    const secondsToReset = resetSeconds(decision.resetAt, Date.now());
    reply.header('ratelimit-limit', String(decision.limit));
    reply.header('ratelimit-remaining', String(decision.remaining));
    reply.header('ratelimit-reset', String(secondsToReset));
    if (!decision.allowed) {
      reply.header('retry-after', String(secondsToReset));
      done(new RateLimitedError('rate limit exceeded'));
      return;
    }
    done();
  });
}
