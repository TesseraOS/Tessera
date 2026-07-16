import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_TENANT_ID } from '@tessera/core';
import {
  buildServer,
  createApiEventBus,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiEventBus,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** E2E for the SSE stream — a real listening socket (inject can't model a long-lived stream). */
describe('@tessera/api SSE /v1/events (FR-38)', () => {
  let app: FastifyInstance;
  let events: ApiEventBus;
  let baseUrl: string;
  const controllers: AbortController[] = [];

  /** Open the SSE stream; `next(predicate)` reads until the accumulated text satisfies `predicate`. */
  async function openStream(token?: string): Promise<{
    response: Response;
    next: (predicate: (text: string) => boolean) => Promise<string>;
  }> {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${baseUrl}/v1/events`, {
      signal: controller.signal,
      headers: {
        accept: 'text/event-stream',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
    });
    if (response.body === null) throw new Error('no response body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const next = async (predicate: (text: string) => boolean): Promise<string> => {
      const deadline = Date.now() + 3000;
      while (!predicate(buffer)) {
        if (Date.now() > deadline) throw new Error(`SSE timeout; buffer so far: ${buffer}`);
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      return buffer;
    };
    return { response, next };
  }

  afterEach(async () => {
    for (const controller of controllers) controller.abort();
    controllers.length = 0;
    await app.close();
  });

  describe('zero-auth build (single Local tenant)', () => {
    beforeEach(async () => {
      const services = await createInMemoryServices();
      events = createApiEventBus();
      app = buildServer(services, { events });
      await app.listen({ host: '127.0.0.1', port: 0 });
      const address = app.server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    it('opens a text/event-stream and sends the connection handshake', async () => {
      const { response, next } = await openStream();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(await next((text) => text.includes(': connected'))).toContain('retry: 3000');
    });

    it('delivers an event emitted on the injected bus to a connected client', async () => {
      const { next } = await openStream();
      await next((text) => text.includes(': connected')); // handshake ⇒ subscription is active

      await events.emit('document.ingested', {
        tenantId: DEFAULT_TENANT_ID,
        ref: 'file:x',
        path: 'src/x.ts',
        kind: 'code',
      });

      const text = await next((t) => t.includes('event: document.ingested'));
      expect(text).toContain('"path":"src/x.ts"');
      expect(text).toContain('"kind":"code"');
      // Tenancy decides delivery but never reaches the client (ADR-0050/ADR-0033).
      expect(text).not.toContain('tenantId');
    });

    it('streams memory.captured when a memory is created via POST /v1/memory', async () => {
      const { next } = await openStream();
      await next((text) => text.includes(': connected'));

      const created = await fetch(`${baseUrl}/v1/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'decision',
          title: 'Adopt SSE',
          body: 'We will stream updates.',
        }),
      });
      expect(created.status).toBe(201);

      const text = await next((t) => t.includes('event: memory.captured'));
      expect(text).toContain('"title":"Adopt SSE"');
      expect(text).toContain('"kind":"decision"');
      expect(text).not.toContain('tenantId');
    });

    it('documents the endpoint in the OpenAPI paths', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
      expect(Object.keys(res.json().paths)).toContain('/v1/events');
    });
  });

  describe('token build — tenant scoping (ADR-0050)', () => {
    let tokenStore: TokenStore;

    beforeEach(async () => {
      const services = await createInMemoryServices();
      events = createApiEventBus();
      tokenStore = createInMemoryTokenStore();
      app = buildServer(services, {
        events,
        auth: createTokenAuthProvider({ tokenStore }),
      });
      await app.listen({ host: '127.0.0.1', port: 0 });
      const address = app.server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    async function token(tenantId: string): Promise<string> {
      const { token: t } = await tokenStore.issue({
        tenantId,
        principalId: `p-${tenantId}`,
        roles: ['owner'] as never,
      });
      return t;
    }

    it('never delivers one tenant events to another (the leak this ADR closes)', async () => {
      const acme = await token('acme');
      const globex = await token('globex');

      const acmeStream = await openStream(acme);
      const globexStream = await openStream(globex);
      await acmeStream.next((t) => t.includes(': connected'));
      await globexStream.next((t) => t.includes(': connected'));

      // Acme's private repository path + memory title.
      await events.emit('source.scan.started', {
        tenantId: 'acme',
        sourceId: 's-1',
        kind: 'git',
        label: 'acme/secret-repo',
      });
      await events.emit('memory.captured', {
        tenantId: 'acme',
        lineageId: 'l-1',
        kind: 'decision',
        title: 'Acme acquires Initech',
      });
      // A globex event, so we have a positive signal to wait for on globex's stream. Without it a
      // passing assertion could just mean "nothing arrived yet" rather than "acme's was withheld".
      await events.emit('source.scan.started', {
        tenantId: 'globex',
        sourceId: 's-2',
        kind: 'git',
        label: 'globex/own-repo',
      });

      // Acme sees its own.
      const acmeText = await acmeStream.next((t) => t.includes('event: memory.captured'));
      expect(acmeText).toContain('acme/secret-repo');
      expect(acmeText).toContain('Acme acquires Initech');

      // Globex sees only its own — proven by waiting for globex's OWN event to arrive first, which
      // means acme's two earlier emits have already been processed and withheld.
      const globexText = await globexStream.next((t) => t.includes('globex/own-repo'));
      expect(globexText).not.toContain('acme/secret-repo');
      expect(globexText).not.toContain('Acme acquires Initech');
      expect(globexText).not.toContain('event: memory.captured');
    });

    it('attributes a memory captured over HTTP to the capturing tenant only', async () => {
      const acme = await token('acme');
      const globex = await token('globex');
      const acmeStream = await openStream(acme);
      const globexStream = await openStream(globex);
      await acmeStream.next((t) => t.includes(': connected'));
      await globexStream.next((t) => t.includes(': connected'));

      await fetch(`${baseUrl}/v1/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${acme}` },
        body: JSON.stringify({ kind: 'decision', title: 'Acme internal', body: 'Private.' }),
      });
      // A globex capture afterwards gives globex's stream a positive signal to wait on.
      await fetch(`${baseUrl}/v1/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${globex}` },
        body: JSON.stringify({ kind: 'lesson', title: 'Globex own', body: 'Ours.' }),
      });

      const acmeText = await acmeStream.next((t) => t.includes('Acme internal'));
      expect(acmeText).not.toContain('Globex own');

      const globexText = await globexStream.next((t) => t.includes('Globex own'));
      expect(globexText).not.toContain('Acme internal');
    });

    it('401s an unauthenticated subscriber (F-044 authentication still applies)', async () => {
      const response = await fetch(`${baseUrl}/v1/events`, {
        headers: { accept: 'text/event-stream' },
      });
      expect(response.status).toBe(401);
    });
  });
});
