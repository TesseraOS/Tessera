'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Footer theme toggle (ADR-0044): Desert Rose dusk ↔ Modern Minimalist noon. A labelled
 * segmented control with aria-pressed states; renders after mount to avoid hydration
 * mismatch (next-themes reads localStorage).
 */
const OPTIONS = [
  { value: 'dark', label: 'Dusk' },
  { value: 'light', label: 'Noon' },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex items-center gap-1 rounded-md border p-1"
    >
      {OPTIONS.map((option) => {
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              'text-label rounded-sm px-3 py-1.5 font-mono transition-colors duration-200',
              active
                ? 'bg-secondary text-foreground'
                : 'text-faint-foreground hover:text-foreground',
            )}
          >
            {option.value === 'dark' ? (
              <span className="mr-1.5 inline-block" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="currentColor" className="inline size-3">
                  <path d="M13.5 9.7A5.5 5.5 0 0 1 6.3 2.5a.4.4 0 0 0-.5-.5 6.5 6.5 0 1 0 8.2 8.2.4.4 0 0 0-.5-.5Z" />
                </svg>
              </span>
            ) : (
              <span className="mr-1.5 inline-block" aria-hidden="true">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  className="inline size-3"
                >
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13" />
                </svg>
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
