import { ValidationError } from '@tessera/core';
import { describe, expect, it } from 'vitest';
import { createInMemoryRateLimiter } from './rate-limit.js';

describe('createInMemoryRateLimiter (F-044)', () => {
  it('allows up to the limit then denies within a window', () => {
    const limiter = createInMemoryRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    const first = limiter.consume('k');
    const second = limiter.consume('k');
    const third = limiter.consume('k');

    expect(first).toMatchObject({ allowed: true, limit: 2, remaining: 1, resetAt: 1000 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(third).toMatchObject({ allowed: false, remaining: 0, resetAt: 1000 });
  });

  it('resets on the first request after the window elapses', () => {
    let t = 0;
    const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(false);
    t = 1000; // window elapsed
    const afterReset = limiter.consume('k');
    expect(afterReset).toMatchObject({ allowed: true, remaining: 0, resetAt: 2000 });
  });

  it('meters keys independently', () => {
    const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('b').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
  });

  it('rejects non-positive limit/window at construction', () => {
    expect(() => createInMemoryRateLimiter({ limit: 0, windowMs: 1000 })).toThrow(ValidationError);
    expect(() => createInMemoryRateLimiter({ limit: 5, windowMs: 0 })).toThrow(ValidationError);
  });
});
