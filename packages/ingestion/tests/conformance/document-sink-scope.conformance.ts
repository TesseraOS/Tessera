import { DEFAULT_PROJECT_ID, DEFAULT_TENANT_ID, newId } from '@tessera/core';
import { describe, expect, it } from 'vitest';
import type { ProcessedDocument } from '../../src/domain';
import type { DocumentSink } from '../../src/ports/sink';

/**
 * The ONE scope-routing property every {@link DocumentSink} must satisfy (F-071, ADR-0057), so a
 * future sink inherits the guarantee by running this suite — exactly as ADR-0033 did for the stores.
 *
 * It deliberately does NOT assert general sink *behaviour* (the sinks are decorators with different
 * semantics — the memory sink's `remove` is a no-op by design, the graph sink extracts, etc.). It
 * asserts only routing: an op on `forTenant(t).forProject(p)` reaches the target IN THAT SCOPE, the
 * base view is `(default, default)`, and `forTenant` resets the project.
 *
 * A sink under test must expose a scope-keyed way to observe where a write landed — a `probe`.
 */
export interface DocumentSinkScopeFixture {
  /** A fresh sink for each assertion (state must not leak between them). */
  makeSink(): DocumentSink;
  /**
   * Count distinct documents the sink persisted in `(tenantId, projectId)`. For a raw persistence
   * sink this reads its partition; for a decorator (graph/memory) it reads the target service.
   */
  countIn(sink: DocumentSink, tenantId: string, projectId: string): Promise<number>;
}

/** A minimal code document keyed by id, so distinct ids land as distinct writes. */
function doc(): ProcessedDocument {
  const id = newId<'Document'>();
  return {
    id,
    source: { id: newId<'Source'>(), kind: 'test', label: 'x' },
    path: `${id}.ts`,
    kind: 'code',
    contentHash: id,
    text: `export const v = "${id}";\n`,
    metadata: {},
    redactions: [],
  };
}

export function runDocumentSinkScopeConformance(
  name: string,
  fixture: DocumentSinkScopeFixture,
): void {
  describe(`DocumentSink scope routing: ${name}`, () => {
    it('routes an upsert to the (tenant, project) of the view, and nowhere else', async () => {
      const sink = fixture.makeSink();
      await sink.forTenant('acme').forProject('beta').upsert(doc());

      expect(await fixture.countIn(sink, 'acme', 'beta')).toBe(1);
      expect(await fixture.countIn(sink, 'globex', DEFAULT_PROJECT_ID)).toBe(0);
      expect(await fixture.countIn(sink, 'acme', DEFAULT_PROJECT_ID)).toBe(0);
      expect(await fixture.countIn(sink, DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)).toBe(0);
    });

    it('writes through the base view into (default, default)', async () => {
      const sink = fixture.makeSink();
      await sink.upsert(doc());
      expect(await fixture.countIn(sink, DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)).toBe(1);
    });

    it('forTenant resets the project to the tenant default', async () => {
      const sink = fixture.makeSink();
      // Chain forProject THEN forTenant: forTenant must win and reset the project.
      await sink.forProject('ignored').forTenant('acme').upsert(doc());
      expect(await fixture.countIn(sink, 'acme', DEFAULT_PROJECT_ID)).toBe(1);
      expect(await fixture.countIn(sink, 'acme', 'ignored')).toBe(0);
    });
  });
}
