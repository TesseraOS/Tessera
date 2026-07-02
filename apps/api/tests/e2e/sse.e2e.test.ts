import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, createApiEventBus, type ApiEventBus } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** E2E for the SSE stream — a real listening socket (inject can't model a long-lived stream). */
describe('@tessera/api SSE /v1/events (FR-38)', () => {
  let app: FastifyInstance;
  let events: ApiEventBus;
  let baseUrl: string;
  const controllers: AbortController[] = [];

  beforeEach(async () => {
    const services = await createInMemoryServices();
    events = createApiEventBus();
    app = buildServer(services, { events });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const controller of controllers) controller.abort();
    controllers.length = 0;
    await app.close();
  });

  /** Open the SSE stream; `next(predicate)` reads until the accumulated text satisfies `predicate`. */
  async function openStream(): Promise<{
    response: Response;
    next: (predicate: (text: string) => boolean) => Promise<string>;
  }> {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${baseUrl}/v1/events`, {
      signal: controller.signal,
      headers: { accept: 'text/event-stream' },
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

  it('opens a text/event-stream and sends the connection handshake', async () => {
    const { response, next } = await openStream();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await next((text) => text.includes(': connected'))).toContain('retry: 3000');
  });

  it('delivers an event emitted on the injected bus to a connected client', async () => {
    const { next } = await openStream();
    await next((text) => text.includes(': connected')); // handshake ⇒ subscription is active

    await events.emit('document.ingested', { ref: 'file:x', path: 'src/x.ts', kind: 'code' });

    const text = await next((t) => t.includes('event: document.ingested'));
    expect(text).toContain('"path":"src/x.ts"');
    expect(text).toContain('"kind":"code"');
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
  });

  it('documents the endpoint in the OpenAPI paths', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(Object.keys(res.json().paths)).toContain('/v1/events');
  });
});
