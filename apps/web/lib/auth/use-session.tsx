'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, TesseraApiError } from '@/lib/api/client';
import { SESSION_ENDPOINT, isLocalIdentity, type Identity } from './session';

/** The sign-in route (rendered without the dashboard chrome). */
const SIGN_IN_PATH = '/signin';

/** Query key for the caller's identity (`GET /v1/me` through the proxy). */
export const IDENTITY_QUERY_KEY = ['session', 'me'] as const;

export type SessionStatus = 'loading' | 'authenticated' | 'signed-out';

export interface SessionValue {
  /** `loading` until the first identity resolves; `signed-out` only on a 401 (token required). */
  readonly status: SessionStatus;
  /** The resolved identity, or `null` when signed out / unreachable. */
  readonly identity: Identity | null;
  /** Whether the identity is the zero-auth local stand-in (⇒ hide sign-out, keep "Local mode"). */
  readonly isLocal: boolean;
  /** Exchange an API token for a session cookie (throws {@link TesseraApiError} on failure). */
  readonly signIn: (token: string) => Promise<void>;
  /** Clear the session cookie and refresh identity. */
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function isUnauthorized(error: unknown): boolean {
  return error instanceof TesseraApiError && error.status === 401;
}

/**
 * Provides the dashboard's auth session (ADR-0048). It fetches the caller's identity via the proxy;
 * a **401** means "token required, not signed in" and redirects to `/signin` (preserving the path),
 * while any other failure falls back to Local so the app stays usable offline. Zero-auth Local mode
 * resolves the local principal, so there is no sign-in screen and behavior is unchanged.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const query = useQuery({
    queryKey: IDENTITY_QUERY_KEY,
    queryFn: () => api.me(),
    retry: false,
    staleTime: 60_000,
  });

  const { status, identity } = useMemo<{ status: SessionStatus; identity: Identity | null }>(() => {
    // Check the error state FIRST: React Query retains the last successful `data` across a failed
    // refetch, so on sign-out (a 401 refetch) `data` still holds the old identity — keying off it
    // would wrongly report "authenticated". `isError` reflects the latest settled fetch.
    if (query.isError) {
      if (isUnauthorized(query.error)) return { status: 'signed-out', identity: null };
      // Unreachable / 5xx: assume Local so the app is still usable; do not force a sign-in.
      return { status: 'authenticated', identity: null };
    }
    if (query.data) return { status: 'authenticated', identity: query.data };
    return { status: 'loading', identity: null };
  }, [query.isError, query.data, query.error]);

  // A 401 on the identity endpoint = a token is required but not present ⇒ send the user to sign in,
  // preserving where they were (ADR-0048). Zero-auth Local mode resolves an identity, so never fires.
  useEffect(() => {
    if (status === 'signed-out' && !pathname.startsWith(SIGN_IN_PATH)) {
      router.replace(`${SIGN_IN_PATH}?return=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  const signIn = useCallback(
    async (token: string) => {
      const res = await fetch(SESSION_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        throw new TesseraApiError(res.status, {
          code: body?.error?.code ?? 'UNAUTHORIZED',
          message: body?.error?.message ?? 'Sign-in failed.',
        });
      }
      await queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await fetch(SESSION_ENDPOINT, { method: 'DELETE' });
    await queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
  }, [queryClient]);

  const value = useMemo<SessionValue>(
    () => ({ status, identity, isLocal: isLocalIdentity(identity), signIn, signOut }),
    [status, identity, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
