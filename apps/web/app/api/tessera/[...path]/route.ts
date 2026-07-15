import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

/** The proxy is per-request (cookie + upstream) — never cache or prerender it. */
export const dynamic = 'force-dynamic';

/** Upstream Tessera API origin — **server-only** (never exposed to the browser). */
function upstreamBase(): string {
  return (process.env.TESSERA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Request headers we never forward: hop-by-hop, ones the upstream must not see (`cookie`/`host`),
 * `authorization` (we set it from the cookie), and `accept-encoding` (so the upstream returns an
 * identity-encoded body we can stream straight through).
 */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'cookie',
  'connection',
  'content-length',
  'authorization',
  'accept-encoding',
]);

/** Response headers we must not copy verbatim when streaming the body through. */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
]);

function envelope(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Same-origin API proxy (ADR-0048): forwards `/api/tessera/<path>` → `TESSERA_API_URL/<path>`,
 * attaching `Authorization: Bearer <token>` from the httpOnly session cookie when present. The
 * upstream status + body stream through unchanged (so the `{error}` envelope and SSE both work). In
 * zero-auth mode there is no cookie ⇒ no bearer ⇒ the API's zero-auth provider grants full access.
 */
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path = [] } = await context.params;
  // SSRF / path-traversal guard: each segment is a single path component; reject anything that could
  // escape the fixed upstream base or inject a new path/scheme.
  if (path.some((seg) => seg === '..' || seg === '.' || seg.includes('/') || seg.includes('\\'))) {
    return envelope(400, 'VALIDATION', 'invalid request path');
  }
  const target = `${upstreamBase()}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);

  const method = request.method.toUpperCase();
  const rawBody = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      ...(rawBody !== undefined && rawBody.byteLength > 0 ? { body: rawBody } : {}),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return envelope(502, 'INTERNAL', 'could not reach the Tessera API');
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
  proxy as HEAD,
};
