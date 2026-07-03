import { describe, expect, it } from 'vitest';
import { TesseraError } from '@tessera/core';
import { createInMemoryQuotaLimiter } from './quota.js';

describe('in-memory QuotaLimiter', () => {
  it('allows up to the limit, then denies, within a window', () => {
    const limiter = createInMemoryQuotaLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect(limiter.consume('p').allowed).toBe(true);
    expect(limiter.consume('p').allowed).toBe(true);
    const third = limiter.consume('p');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(limiter.consume('p').allowed).toBe(false);
  });

  it('meters principals independently', () => {
    const limiter = createInMemoryQuotaLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
    expect(limiter.consume('b').allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    let clock = 0;
    const limiter = createInMemoryQuotaLimiter({ limit: 1, windowMs: 100, now: () => clock });
    expect(limiter.consume('p').allowed).toBe(true);
    expect(limiter.consume('p').allowed).toBe(false);
    clock = 100;
    const after = limiter.consume('p');
    expect(after.allowed).toBe(true);
    expect(after.resetAt).toBe(200);
  });

  it('rejects a non-positive limit or window', () => {
    expect(() => createInMemoryQuotaLimiter({ limit: 0, windowMs: 1000 })).toThrow(TesseraError);
    expect(() => createInMemoryQuotaLimiter({ limit: 5, windowMs: 0 })).toThrow(TesseraError);
  });
});
