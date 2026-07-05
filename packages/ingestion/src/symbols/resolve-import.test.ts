import { describe, expect, it } from 'vitest';
import { fileNodeKey, resolveRelativeImport, stripCodeExtension } from './resolve-import.js';

describe('fileNodeKey / stripCodeExtension', () => {
  it('strips known code extensions and leaves others', () => {
    expect(fileNodeKey('src/a.ts')).toBe('src/a');
    expect(fileNodeKey('src/a.tsx')).toBe('src/a');
    expect(fileNodeKey('src/a.js')).toBe('src/a');
    expect(stripCodeExtension('docs/readme.md')).toBe('docs/readme.md'); // not a code ext
    expect(stripCodeExtension('noext')).toBe('noext');
  });
});

describe('resolveRelativeImport', () => {
  it('resolves relative specifiers to an extensionless source-relative key', () => {
    expect(resolveRelativeImport('src/a.ts', './b')).toBe('src/b');
    expect(resolveRelativeImport('src/a.ts', './b.ts')).toBe('src/b');
    expect(resolveRelativeImport('src/feature/a.ts', '../b')).toBe('src/b');
    expect(resolveRelativeImport('src/feature/a.ts', './nested/c')).toBe('src/feature/nested/c');
    expect(resolveRelativeImport('a.ts', './b')).toBe('b');
  });

  it('skips bare/package specifiers and out-of-repo escapes', () => {
    expect(resolveRelativeImport('src/a.ts', 'react')).toBeUndefined();
    expect(resolveRelativeImport('src/a.ts', '@scope/pkg')).toBeUndefined();
    expect(resolveRelativeImport('src/a.ts', 'node:path')).toBeUndefined();
    expect(resolveRelativeImport('a.ts', '../outside')).toBeUndefined();
  });
});
