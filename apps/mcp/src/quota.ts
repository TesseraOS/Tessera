import { ValidationError } from '@tessera/core';

/**
 * Per-principal request quotas for the MCP gateway (FR-36). A `QuotaLimiter` meters tool calls so one
 * agent/client cannot exhaust the server for others. The in-memory fixed-window adapter here is the
 * Local adapter; a distributed/persistent limiter (Redis, etc.) is a documented seam.
 */

export interface QuotaDecision {
  /** Whether this call is allowed (within the window's limit). */
  readonly allowed: boolean;
  /** The per-window limit. */
  readonly limit: number;
  /** Calls remaining in the current window after this decision. */
  readonly remaining: number;
  /** Epoch-ms when the current window resets. */
  readonly resetAt: number;
}

export interface QuotaLimiter {
  /**
   * Account for one call by a principal in the current window and return the decision. Pure of I/O and
   * non-throwing — the gateway decides how to surface a denial.
   */
  consume(principalId: string): QuotaDecision;
}

export interface InMemoryQuotaOptions {
  /** Max calls allowed per principal per window (> 0). */
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
 * A fixed-window per-principal limiter: each principal may make `limit` calls per `windowMs`; the
 * window resets on the first call after it elapses. Independent buckets per principal.
 */
export function createInMemoryQuotaLimiter(options: InMemoryQuotaOptions): QuotaLimiter {
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new ValidationError('quota limit must be a positive number');
  }
  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
    throw new ValidationError('quota windowMs must be a positive number');
  }
  const { limit, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  return {
    consume(principalId) {
      const t = now();
      let bucket = buckets.get(principalId);
      if (bucket === undefined || t - bucket.windowStart >= windowMs) {
        bucket = { count: 0, windowStart: t };
        buckets.set(principalId, bucket);
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
