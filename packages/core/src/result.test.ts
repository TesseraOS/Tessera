import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok } from './result';

describe('result', () => {
  it('ok wraps a value and narrows', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('err wraps an error and narrows', () => {
    const result = err(new Error('nope'));
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    if (isErr(result)) {
      expect(result.error.message).toBe('nope');
    }
  });
});
