import { describe, expect, it } from 'vitest';
import { createApiEventBus, sseComment, sseFrame } from './events.js';

/** Parse the `data:` JSON out of a frame. */
function frameData(frame: string): Record<string, unknown> {
  const line = frame.split('\n').find((candidate) => candidate.startsWith('data: '));
  return JSON.parse(line!.slice('data: '.length)) as Record<string, unknown>;
}

describe('SSE framing', () => {
  it('formats a named event frame as event + data lines', () => {
    const frame = sseFrame('memory.captured', { title: 'T' });
    expect(frame.startsWith('event: memory.captured\ndata: {')).toBe(true);
    expect(frame.endsWith('\n\n')).toBe(true);
    expect(frameData(frame)['title']).toBe('T');
  });

  it('stamps occurredAt from the SERVER clock (F-065)', () => {
    // The client used to substitute its own clock for live rows, which drifts and orders them
    // wrongly against anything fetched from the API. One stamp, one place.
    const before = Date.now();
    const occurredAt = frameData(sseFrame('memory.captured', { title: 'T' }))['occurredAt'];
    expect(typeof occurredAt).toBe('string');
    const parsed = Date.parse(occurredAt as string);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('never puts tenantId on the wire, stamped or not (ADR-0050)', () => {
    const data = frameData(sseFrame('memory.captured', { tenantId: 'acme', title: 'T' }));
    expect(data).not.toHaveProperty('tenantId');
    expect(data['occurredAt']).toBeDefined();
  });

  it('lets a payload keep its own occurredAt rather than overwriting it', () => {
    const data = frameData(sseFrame('memory.captured', { occurredAt: '2026-01-01T00:00:00.000Z' }));
    expect(data['occurredAt']).toBe('2026-01-01T00:00:00.000Z');
  });

  it('passes a non-object payload through untouched', () => {
    expect(sseFrame('ping', 'hello')).toBe('event: ping\ndata: "hello"\n\n');
  });

  it('formats a comment line', () => {
    expect(sseComment('ping')).toBe(': ping\n\n');
  });
});

describe('createApiEventBus', () => {
  it('delivers an emitted payload to a subscriber', async () => {
    const bus = createApiEventBus();
    const received: unknown[] = [];
    bus.on('memory.captured', (payload) => {
      received.push(payload);
    });

    await bus.emit('memory.captured', { lineageId: 'l1', kind: 'decision', title: 'T' });

    expect(received).toEqual([{ lineageId: 'l1', kind: 'decision', title: 'T' }]);
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = createApiEventBus();
    let count = 0;
    const unsubscribe = bus.on('document.ingested', () => {
      count += 1;
    });

    await bus.emit('document.ingested', { ref: 'r', path: 'p', kind: 'code' });
    unsubscribe();
    await bus.emit('document.ingested', { ref: 'r', path: 'p', kind: 'code' });

    expect(count).toBe(1);
  });
});
