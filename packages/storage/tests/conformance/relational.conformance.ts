import { describe, expect, it } from 'vitest';
import type { RelationalStore } from '../../src/ports/relational';

export interface RelationalHarness {
  store: RelationalStore;
  cleanup: () => Promise<void>;
}

/** Builds a fresh RelationalStore (isolated database) and a cleanup for each test. */
export type RelationalFactory = () => Promise<RelationalHarness>;

/** The behavioral contract every {@link RelationalStore} adapter must satisfy (ADR-0003). */
export function runRelationalConformance(name: string, makeStore: RelationalFactory): void {
  describe(`RelationalStore conformance: ${name}`, () => {
    it('migrate() resolves and is idempotent', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.migrate();
        await store.migrate();
      } finally {
        await cleanup();
      }
    });

    it('healthcheck() is true while open and false after close', async () => {
      const { store, cleanup } = await makeStore();
      try {
        expect(await store.healthcheck()).toBe(true);
        await store.close();
        expect(await store.healthcheck()).toBe(false);
      } finally {
        await cleanup();
      }
    });

    it('close() is idempotent', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.close();
        await store.close();
      } finally {
        await cleanup();
      }
    });
  });
}
