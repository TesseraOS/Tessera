import { describe, expect, it } from 'vitest';
import { createApiEventBus, sseComment, sseFrame } from './events.js';

describe('SSE framing', () => {
  it('formats a named event frame as event + data lines', () => {
    expect(sseFrame('memory.captured', { title: 'T' })).toBe(
      'event: memory.captured\ndata: {"title":"T"}\n\n',
    );
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
