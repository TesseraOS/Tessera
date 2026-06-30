import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('text-sm', 'font-medium')).toBe('text-sm font-medium');
  });

  it('drops falsy values', () => {
    expect(cn('text-sm', false, undefined, null, 'font-medium')).toBe('text-sm font-medium');
  });

  it('de-duplicates conflicting tailwind utilities (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
