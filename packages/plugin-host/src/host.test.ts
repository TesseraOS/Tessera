import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Plugin } from './domain.js';
import { createPluginHost } from './host.js';

const counterConfig = z.object({ start: z.number().int() });

/** A synthetic plugin: a counter capability with spy-able lifecycle hooks. */
function counterPlugin(
  id: string,
  hooks: { start?: () => void; stop?: () => void; dispose?: () => void } = {},
): Plugin<{ start: number }, { value: () => number }> {
  return {
    manifest: { id, kind: 'processor', name: id, version: '1.0.0', configSchema: counterConfig },
    setup(config) {
      let value = config.start;
      return {
        capability: { value: () => value },
        start: () => {
          value += 1;
          hooks.start?.();
        },
        stop: () => hooks.stop?.(),
        dispose: () => hooks.dispose?.(),
      };
    },
  };
}

describe('createPluginHost', () => {
  it('validates config, loads, and exposes the capability', async () => {
    const host = createPluginHost();
    host.register(counterPlugin('p.counter'));

    const info = await host.load('p.counter', { start: 10 });
    expect(info).toMatchObject({ id: 'p.counter', kind: 'processor', status: 'loaded' });
    expect(host.capability<{ value: () => number }>('p.counter')?.value()).toBe(10);
  });

  it('isolates an invalid config as failed without throwing', async () => {
    const host = createPluginHost();
    host.register(counterPlugin('p.counter'));

    const info = await host.load('p.counter', { start: 'nope' });
    expect(info.status).toBe('failed');
    expect(info.error).toMatch(/invalid config/);
    expect(host.capability('p.counter')).toBeUndefined();
  });

  it('rejects a duplicate id and throws for an unknown id', async () => {
    const host = createPluginHost();
    host.register(counterPlugin('p.counter'));
    expect(() => host.register(counterPlugin('p.counter'))).toThrow(/already registered/);
    await expect(host.load('p.missing')).rejects.toThrow(/not registered/);
  });

  it('isolates a setup failure', async () => {
    const host = createPluginHost();
    host.register({
      manifest: {
        id: 'p.badsetup',
        kind: 'connector',
        name: 'bad',
        version: '1',
        configSchema: z.object({}),
      },
      setup() {
        throw new Error('setup boom');
      },
    });

    const info = await host.load('p.badsetup');
    expect(info.status).toBe('failed');
    expect(info.error).toBe('setup boom');
  });

  it('drives the load → start → stop → dispose lifecycle', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const dispose = vi.fn();
    const host = createPluginHost();
    host.register(counterPlugin('p.counter', { start, stop, dispose }));

    await host.load('p.counter', { start: 0 });
    expect((await host.start('p.counter')).status).toBe('started');
    expect(start).toHaveBeenCalledOnce();
    expect(host.capability<{ value: () => number }>('p.counter')?.value()).toBe(1); // start incremented

    expect((await host.stop('p.counter')).status).toBe('stopped');
    expect(stop).toHaveBeenCalledOnce();

    await host.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(host.capability('p.counter')).toBeUndefined();
  });

  it('startAll isolates one failing plugin while starting the others', async () => {
    const host = createPluginHost();
    host.register(counterPlugin('p.ok'));
    host.register({
      manifest: {
        id: 'p.badstart',
        kind: 'connector',
        name: 'bad',
        version: '1',
        configSchema: z.object({}),
      },
      setup() {
        return {
          capability: {},
          start() {
            throw new Error('start boom');
          },
        };
      },
    });

    await host.load('p.ok', { start: 0 });
    await host.load('p.badstart');
    const infos = await host.startAll();

    expect(infos.find((i) => i.id === 'p.ok')?.status).toBe('started');
    const bad = infos.find((i) => i.id === 'p.badstart');
    expect(bad?.status).toBe('failed');
    expect(bad?.error).toBe('start boom');
  });

  it('lists registered plugins, filtered by kind', async () => {
    const host = createPluginHost();
    host.register(counterPlugin('p.proc'));
    host.register({
      manifest: {
        id: 'p.conn',
        kind: 'connector',
        name: 'c',
        version: '1',
        configSchema: z.object({}),
      },
      setup: () => ({ capability: {} }),
    });

    expect(
      host
        .list()
        .map((i) => i.id)
        .sort(),
    ).toEqual(['p.conn', 'p.proc']);
    expect(host.list({ kind: 'connector' }).map((i) => i.id)).toEqual(['p.conn']);
  });
});
