import { describe, expect, it } from 'vitest';
import { isId, newId } from './id';

describe('id', () => {
  it('newId returns a unique, non-empty string', () => {
    const a = newId();
    const b = newId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('isId accepts ids and rejects non-ids', () => {
    expect(isId(newId())).toBe(true);
    expect(isId('')).toBe(false);
    expect(isId(123)).toBe(false);
    expect(isId(null)).toBe(false);
  });
});
