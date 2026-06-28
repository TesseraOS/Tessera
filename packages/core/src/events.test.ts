import { describe, expect, it } from 'vitest';
import { createEventBus } from './events';

interface TestEvents {
  ping: { n: number };
}

describe('events', () => {
  it('delivers payloads to a handler', async () => {
    const bus = createEventBus<TestEvents>();
    let received = 0;
    bus.on('ping', (payload) => {
      received = payload.n;
    });
    await bus.emit('ping', { n: 7 });
    expect(received).toBe(7);
  });

  it('awaits async handlers before resolving emit', async () => {
    const bus = createEventBus<TestEvents>();
    let done = false;
    bus.on('ping', async () => {
      await Promise.resolve();
      done = true;
    });
    await bus.emit('ping', { n: 1 });
    expect(done).toBe(true);
  });

  it('unsubscribes via the returned function and via off()', async () => {
    const bus = createEventBus<TestEvents>();
    let count = 0;
    const handler = (): void => {
      count += 1;
    };
    const unsubscribe = bus.on('ping', handler);
    await bus.emit('ping', { n: 1 });
    unsubscribe();
    await bus.emit('ping', { n: 1 });
    expect(count).toBe(1);
  });

  it('supports multiple handlers for one event', async () => {
    const bus = createEventBus<TestEvents>();
    let a = 0;
    let b = 0;
    bus.on('ping', () => {
      a += 1;
    });
    bus.on('ping', () => {
      b += 1;
    });
    await bus.emit('ping', { n: 1 });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
