import { describe, expect, it } from 'vitest';
import type { SourceRegistry } from './registry.js';

export interface SourceRegistryHarness {
  registry: SourceRegistry;
  cleanup?: () => Promise<void>;
}

/** Builds a fresh, isolated {@link SourceRegistry} per test. */
export type SourceRegistryFactory = () => Promise<SourceRegistryHarness>;

/** The behavioral contract every {@link SourceRegistry} adapter must satisfy (F-038, ADR-0040). */
export function runSourceRegistryConformance(name: string, make: SourceRegistryFactory): void {
  describe(`SourceRegistry conformance: ${name}`, () => {
    it('registers, reads, and lists sources (oldest first)', async () => {
      const { registry, cleanup } = await make();
      try {
        const a = await registry.register({ kind: 'filesystem', config: { root: '/a' } });
        const b = await registry.register({
          kind: 'git',
          label: 'repo',
          config: { root: '/b' },
        });

        expect(a.id).not.toBe(b.id);
        expect(a.label).toBe('/a'); // defaults to the config root
        expect(b.label).toBe('repo');
        expect(a.config).toEqual({ root: '/a' });

        expect(await registry.get(a.id)).toEqual(a);
        const listed = await registry.list();
        expect(listed.map((r) => r.id)).toEqual([a.id, b.id]);
      } finally {
        await cleanup?.();
      }
    });

    it('removes a source (get → undefined, dropped from the list)', async () => {
      const { registry, cleanup } = await make();
      try {
        const a = await registry.register({ kind: 'filesystem', config: { root: '/a' } });
        await registry.remove(a.id);
        expect(await registry.get(a.id)).toBeUndefined();
        expect(await registry.list()).toHaveLength(0);
        // Removing an unknown id is a no-op (idempotent).
        await expect(registry.remove(a.id)).resolves.toBeUndefined();
      } finally {
        await cleanup?.();
      }
    });

    it('isolates sources by tenant (forTenant) — no cross-tenant reads', async () => {
      const { registry, cleanup } = await make();
      try {
        const a = registry.forTenant('tenant-a');
        const b = registry.forTenant('tenant-b');
        const inA = await a.register({ kind: 'filesystem', config: { root: '/a' } });
        await b.register({ kind: 'git', config: { root: '/b' } });

        const aList = await a.list();
        expect(aList).toHaveLength(1);
        expect(aList[0]?.id).toBe(inA.id);
        expect(aList[0]?.tenantId).toBe('tenant-a');

        // b cannot see or remove a's source.
        expect(await b.get(inA.id)).toBeUndefined();
        await b.remove(inA.id);
        expect(await a.get(inA.id)).toBeDefined();

        // The base (default) view sees neither tenant's sources.
        expect(await registry.list()).toHaveLength(0);
      } finally {
        await cleanup?.();
      }
    });

    it('isolates sources by project (forProject) within a tenant — no cross-project reads', async () => {
      const { registry, cleanup } = await make();
      try {
        const tenant = registry.forTenant('tenant-a');
        const p1 = tenant.forProject('project-1');
        const p2 = tenant.forProject('project-2');
        const inP1 = await p1.register({ kind: 'filesystem', config: { root: '/a' } });
        await p2.register({ kind: 'git', config: { root: '/b' } });

        const p1List = await p1.list();
        expect(p1List).toHaveLength(1);
        expect(p1List[0]?.id).toBe(inP1.id);
        expect(p1List[0]?.tenantId).toBe('tenant-a');
        expect(p1List[0]?.projectId).toBe('project-1');

        // project-2 cannot see or remove project-1's source.
        expect(await p2.get(inP1.id)).toBeUndefined();
        await p2.remove(inP1.id);
        expect(await p1.get(inP1.id)).toBeDefined();

        // The tenant's default project is a distinct scope and sees neither.
        expect(await tenant.list()).toHaveLength(0);
      } finally {
        await cleanup?.();
      }
    });
  });
}
