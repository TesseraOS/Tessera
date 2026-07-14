import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

const SEARCH_BODY = { query: 'authentication tokens' };

/** End-to-end coverage for the F-044 hardening surface over the HTTP boundary. */
describe('@tessera/api hardening (F-044)', () => {
  let services: ApiServices;

  beforeEach(async () => {
    services = await createInMemoryServices();
  });

  describe('security headers', () => {
    let app: ReturnType<typeof buildServer>;
    afterEach(async () => {
      await app.close();
    });

    it('sets the baseline security headers on every response (no HSTS by default)', async () => {
      app = buildServer(services);
      await app.ready();
      const res = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('adds HSTS when the TLS flag is set', async () => {
      app = buildServer(services, { security: { hsts: true } });
      await app.ready();
      const res = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
      expect(res.headers['strict-transport-security']).toMatch(/^max-age=\d+; includeSubDomains$/);
    });
  });

  describe('request-id correlation', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('generates and echoes a request id when none is supplied', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
      expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f-]{36}$/);
    });

    it('honors a well-formed inbound x-request-id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/search',
        payload: SEARCH_BODY,
        headers: { 'x-request-id': 'trace-abc.123' },
      });
      expect(res.headers['x-request-id']).toBe('trace-abc.123');
    });

    it('rejects a malformed inbound id and generates a fresh one (no injection)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/search',
        payload: SEARCH_BODY,
        headers: { 'x-request-id': 'bad id with spaces!' },
      });
      expect(res.headers['x-request-id']).not.toBe('bad id with spaces!');
      expect(res.headers['x-request-id']).toMatch(/^req_/);
    });
  });

  describe('rate limiting on /v1', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services, { rateLimit: { enabled: true, limit: 2, windowMs: 60_000 } });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('allows up to the limit, then 429s with the RATE_LIMITED envelope + RateLimit headers', async () => {
      const first = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
      const second = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
      const third = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });

      expect(first.statusCode).toBe(200);
      expect(first.headers['ratelimit-limit']).toBe('2');
      expect(first.headers['ratelimit-remaining']).toBe('1');
      expect(second.statusCode).toBe(200);
      expect(second.headers['ratelimit-remaining']).toBe('0');

      expect(third.statusCode).toBe(429);
      expect(third.json().error.code).toBe('RATE_LIMITED');
      expect(third.headers['ratelimit-remaining']).toBe('0');
      expect(third.headers['retry-after']).toBeDefined();
    });

    it('does not rate limit when disabled (default)', async () => {
      const plain = buildServer(services);
      await plain.ready();
      for (let i = 0; i < 5; i += 1) {
        const res = await plain.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
        expect(res.statusCode).toBe(200);
        expect(res.headers['ratelimit-limit']).toBeUndefined();
      }
      await plain.close();
    });
  });

  describe('CORS allowlist (per profile)', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services, { cors: { allowedOrigins: ['https://app.example.com'] } });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('reflects an allowed origin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/search',
        payload: SEARCH_BODY,
        headers: { origin: 'https://app.example.com' },
      });
      expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
    });

    it('never reflects a disallowed origin', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/v1/search',
        headers: {
          origin: 'https://evil.example.com',
          'access-control-request-method': 'POST',
        },
      });
      expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
    });
  });

  describe('SSE authentication under a token provider', () => {
    let app: ReturnType<typeof buildServer>;
    let tokenStore: TokenStore;

    beforeEach(async () => {
      tokenStore = createInMemoryTokenStore();
      app = buildServer(services, { auth: createTokenAuthProvider({ tokenStore }) });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('rejects an unauthenticated SSE request with 401 (no bypass)', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/events' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('streams to an authenticated client over a real socket', async () => {
      await app.listen({ host: '127.0.0.1', port: 0 });
      const { port } = app.server.address() as AddressInfo;
      const { token } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'reader',
        roles: ['viewer'],
      });
      const controller = new AbortController();
      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/events`, {
          headers: { accept: 'text/event-stream', authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      } finally {
        controller.abort();
      }
    });
  });
});
