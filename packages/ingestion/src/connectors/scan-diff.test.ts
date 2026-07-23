import { DEFAULT_PROJECT_ID, DEFAULT_TENANT_ID } from '@tessera/core';
import { describe, expect, it } from 'vitest';
import type { IngestionScope, SourceDescriptor, SourceEntry } from '../domain.js';
import { diffEntries } from './scan-diff.js';

const source: SourceDescriptor = {
  id: 'src-1' as SourceDescriptor['id'],
  kind: 'test',
  label: 'fixture',
};

const scope: IngestionScope = { tenantId: 'acme', projectId: 'beta' };

const entry = (path: string, contentHash: string): SourceEntry => ({ path, contentHash });

describe('diffEntries', () => {
  it('reports every entry as added against an empty manifest, stamped with the scope', () => {
    const events = diffEntries(
      source,
      scope,
      [entry('a.ts', 'h1'), entry('b.ts', 'h2')],
      new Map(),
    );

    expect(events).toEqual([
      { source, scope, path: 'a.ts', changeKind: 'added', contentHash: 'h1' },
      { source, scope, path: 'b.ts', changeKind: 'added', contentHash: 'h2' },
    ]);
  });

  it('emits nothing when nothing changed', () => {
    const prior = new Map([
      ['a.ts', 'h1'],
      ['b.ts', 'h2'],
    ]);

    const events = diffEntries(source, scope, [entry('a.ts', 'h1'), entry('b.ts', 'h2')], prior);

    expect(events).toEqual([]);
  });

  it('emits only the modified entry when one file changes', () => {
    const prior = new Map([
      ['a.ts', 'h1'],
      ['b.ts', 'h2'],
    ]);

    const events = diffEntries(
      source,
      scope,
      [entry('a.ts', 'h1'), entry('b.ts', 'h2-new')],
      prior,
    );

    expect(events).toEqual([
      { source, scope, path: 'b.ts', changeKind: 'modified', contentHash: 'h2-new' },
    ]);
  });

  it('emits a removal for a path that disappeared', () => {
    const prior = new Map([
      ['a.ts', 'h1'],
      ['gone.ts', 'h9'],
    ]);

    const events = diffEntries(source, scope, [entry('a.ts', 'h1')], prior);

    expect(events).toEqual([{ source, scope, path: 'gone.ts', changeKind: 'removed' }]);
  });

  it('stamps the default scope when that is what it is given', () => {
    const base: IngestionScope = { tenantId: DEFAULT_TENANT_ID, projectId: DEFAULT_PROJECT_ID };
    const [event] = diffEntries(source, base, [entry('a.ts', 'h1')], new Map());
    expect(event?.scope).toEqual(base);
  });
});
