'use client';

import type { CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Toast host (DESIGN-SYSTEM §3 feedback) — themed via tokens, follows light/dark/system. */
function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();
  const activeTheme: 'light' | 'dark' | 'system' =
    theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system';

  return (
    <Sonner
      theme={activeTheme}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
