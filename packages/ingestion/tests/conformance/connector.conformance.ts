import { describe, expect, it } from 'vitest';
import type { Connector } from '../../src/ports/connector';

export interface ConnectorFixture {
  readonly connector: Connector;
  /** Paths that must be present in `list()` (a subset is fine; extras are allowed). */
  readonly expectedPaths: readonly string[];
  /** A source-relative path that does not exist. */
  readonly missingPath: string;
}

/**
 * The behavioral contract every {@link Connector} must satisfy (ADR-0003 conformance suite,
 * ADR-0014 layout). Each connector runs it from its own `tests/integration` file against a real
 * backend it has populated.
 */
export function runConnectorConformance(
  name: string,
  setup: () => Promise<ConnectorFixture>,
): void {
  describe(`Connector conformance: ${name}`, () => {
    it('lists every expected path with a non-empty content hash', async () => {
      const { connector, expectedPaths } = await setup();

      const entries = await connector.list();
      const listed = new Map(entries.map((entry) => [entry.path, entry.contentHash]));

      for (const path of expectedPaths) {
        expect(listed.has(path)).toBe(true);
        expect(listed.get(path)).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('resolves listed content whose hash matches the listing', async () => {
      const { connector, expectedPaths } = await setup();
      const [path] = expectedPaths;
      expect(path).toBeDefined();

      const entries = await connector.list();
      const listedHash = entries.find((entry) => entry.path === path)?.contentHash;
      const raw = await connector.resolve(path as string);

      expect(raw).toBeDefined();
      expect(raw?.path).toBe(path);
      expect(raw?.bytes.length).toBeGreaterThan(0);
      expect(raw?.contentHash).toBe(listedHash);
    });

    it('returns undefined when resolving a path that does not exist', async () => {
      const { connector, missingPath } = await setup();

      expect(await connector.resolve(missingPath)).toBeUndefined();
    });

    it('produces deterministic hashes across repeated scans', async () => {
      const { connector } = await setup();

      const first = new Map(
        (await connector.list()).map((entry) => [entry.path, entry.contentHash]),
      );
      const second = new Map(
        (await connector.list()).map((entry) => [entry.path, entry.contentHash]),
      );

      expect(second).toEqual(first);
    });
  });
}
