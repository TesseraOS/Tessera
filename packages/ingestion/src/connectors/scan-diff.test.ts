import { describe, expect, it } from 'vitest';
import type { SourceDescriptor, SourceEntry } from '../domain.js';
import { diffEntries } from './scan-diff.js';

const source: SourceDescriptor = {
  id: 'src-1' as SourceDescriptor['id'],
  kind: 'test',
  label: 'fixture',
};

const entry = (path: string, contentHash: string): SourceEntry => ({ path, contentHash });

describe('diffEntries', () => {
  it('reports every entry as added against an empty manifest', () => {
    const events = diffEntries(source, [entry('a.ts', 'h1'), entry('b.ts', 'h2')], new Map());

    expect(events).toEqual([
      { source, path: 'a.ts', changeKind: 'added', contentHash: 'h1' },
      { source, path: 'b.ts', changeKind: 'added', contentHash: 'h2' },
    ]);
  });

  it('emits nothing when nothing changed', () => {
    const prior = new Map([
      ['a.ts', 'h1'],
      ['b.ts', 'h2'],
    ]);

    const events = diffEntries(source, [entry('a.ts', 'h1'), entry('b.ts', 'h2')], prior);

    expect(events).toEqual([]);
  });

  it('emits only the modified entry when one file changes', () => {
    const prior = new Map([
      ['a.ts', 'h1'],
      ['b.ts', 'h2'],
    ]);

    const events = diffEntries(source, [entry('a.ts', 'h1'), entry('b.ts', 'h2-new')], prior);

    expect(events).toEqual([
      { source, path: 'b.ts', changeKind: 'modified', contentHash: 'h2-new' },
    ]);
  });

  it('emits a removal for a path that disappeared', () => {
    const prior = new Map([
      ['a.ts', 'h1'],
      ['gone.ts', 'h9'],
    ]);

    const events = diffEntries(source, [entry('a.ts', 'h1')], prior);

    expect(events).toEqual([{ source, path: 'gone.ts', changeKind: 'removed' }]);
  });
});
