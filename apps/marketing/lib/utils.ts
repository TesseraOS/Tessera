import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must be taught the closed type scale (MARKETING-DESIGN §2.3): without
 * this, `text-small` (font-size) and `text-primary-foreground` (color) are treated as
 * conflicting text-* utilities and the color class gets silently dropped.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'title', 'heading', 'lead', 'body', 'small', 'label'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
