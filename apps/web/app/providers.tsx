'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TesseraApiError } from '@/lib/api/client';
import { SessionProvider } from '@/lib/auth/use-session';

/** App-wide client providers: server-state (TanStack Query), session, theming, motion, tooltips, toasts. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Never retry a client error (a 401/403/404 will not become a 200); retry once otherwise.
            // Signed-out (401) redirects are driven by the SessionProvider's identity query (ADR-0048).
            retry: (count, error) =>
              !(error instanceof TesseraApiError && error.status < 500) && count < 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <MotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={200}>
              {children}
              <Toaster />
            </TooltipProvider>
          </MotionConfig>
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
