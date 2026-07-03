import { beforeAll, describe, expect, it } from 'vitest';
import { TesseraError } from '@tessera/core';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';
import { createOidcAuthProvider } from './oidc.js';

const ISSUER = 'https://idp.example.com';
const AUDIENCE = 'tessera-api';
const KID = 'test-key';

let privateKey: CryptoKey;
let keySet: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: KID, alg: 'RS256' }] });
});

interface TokenOpts {
  readonly subject?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresAt?: number; // epoch seconds
  readonly claims?: Record<string, unknown>;
}

async function signToken(opts: TokenOpts = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(opts.claims ?? {})
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setSubject(opts.subject ?? 'user-1')
    .setIssuedAt(now)
    .setExpirationTime(opts.expiresAt ?? now + 300)
    .sign(privateKey);
}

function provider() {
  return createOidcAuthProvider({ issuer: ISSUER, audience: AUDIENCE, keySet });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}`, headers: {} });
const hasCode = (code: string) => (e: unknown) => e instanceof TesseraError && e.code === code;

describe('OIDC AuthProvider', () => {
  it('verifies a valid token and maps claims to a principal', async () => {
    const token = await signToken({
      subject: 'auth0|abc',
      claims: { roles: ['admin'], tenant_id: 'acme', name: 'Alice' },
    });
    const ctx = await provider().authenticate(bearer(token));
    expect(ctx.principal).toMatchObject({ id: 'auth0|abc', kind: 'user', displayName: 'Alice' });
    expect(ctx.tenantId).toBe('acme');
    expect(ctx.permissions.has('admin:manage')).toBe(true);
  });

  it('maps a space-delimited roles claim and defaults tenant', async () => {
    const token = await signToken({ claims: { roles: 'member viewer' } });
    const ctx = await provider().authenticate(bearer(token));
    expect(ctx.tenantId).toBe('default');
    expect(ctx.permissions.has('memory:write')).toBe(true); // member
  });

  it('falls back to the default role when no catalog role is present', async () => {
    const token = await signToken({ claims: { roles: ['superuser'] } });
    const ctx = await provider().authenticate(bearer(token));
    expect(ctx.permissions.has('search:read')).toBe(true); // viewer
    expect(ctx.permissions.has('memory:write')).toBe(false);
  });

  it('rejects a missing token', async () => {
    await expect(provider().authenticate({ headers: {} })).rejects.toSatisfy(
      hasCode('UNAUTHORIZED'),
    );
  });

  it('rejects an expired token', async () => {
    const token = await signToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    await expect(provider().authenticate(bearer(token))).rejects.toSatisfy(hasCode('UNAUTHORIZED'));
  });

  it('rejects a wrong audience', async () => {
    const token = await signToken({ audience: 'some-other-api' });
    await expect(provider().authenticate(bearer(token))).rejects.toSatisfy(hasCode('UNAUTHORIZED'));
  });

  it('rejects a wrong issuer', async () => {
    const token = await signToken({ issuer: 'https://evil.example.com' });
    await expect(provider().authenticate(bearer(token))).rejects.toSatisfy(hasCode('UNAUTHORIZED'));
  });
});
