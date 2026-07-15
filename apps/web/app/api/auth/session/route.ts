import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

/** Cookie writes are per-request — never cache/prerender. */
export const dynamic = 'force-dynamic';

/** 30 days — long enough to stay signed in, bounded so a leaked cookie eventually expires. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function upstreamBase(): string {
  return (process.env.TESSERA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function envelope(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * `POST { token }` — sign in (ADR-0048). Validates the API token by calling `/v1/me` with it; on
 * success sets the httpOnly session cookie and returns the identity, so the token is validated
 * server-side and never held in client JS. An invalid token flows through as 401.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let token: unknown;
  try {
    ({ token } = (await request.json()) as { token?: unknown });
  } catch {
    return envelope(400, 'VALIDATION', 'expected a JSON body { token }');
  }
  if (typeof token !== 'string' || token.trim().length === 0) {
    return envelope(400, 'VALIDATION', 'a non-empty API token is required');
  }
  const trimmed = token.trim();

  let res: Response;
  try {
    res = await fetch(`${upstreamBase()}/v1/me`, {
      headers: { authorization: `Bearer ${trimmed}` },
      cache: 'no-store',
    });
  } catch {
    return envelope(502, 'INTERNAL', 'could not reach the Tessera API');
  }
  if (!res.ok) {
    const body = await res.text();
    return new Response(
      body.length > 0
        ? body
        : JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'invalid token' } }),
      { status: res.status, headers: { 'content-type': 'application/json' } },
    );
  }

  const identity: unknown = await res.json();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, trimmed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json(identity, { status: 200 });
}

/** `DELETE` — sign out: clear the session cookie. */
export async function DELETE(): Promise<Response> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
