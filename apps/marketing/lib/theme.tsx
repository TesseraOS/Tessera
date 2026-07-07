'use client';

/**
 * The theme seam (ADR-0044) — the ONLY file allowed to import next-themes (design-lint
 * enforces the boundary). Dark (Desert Rose) is the brand default; light (Modern
 * Minimalist) is opt-in from the footer toggle. Components stay tokens-only.
 */
import type React from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';

export { useTheme };

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
