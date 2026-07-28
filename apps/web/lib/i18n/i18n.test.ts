import { describe, expect, it } from 'vitest';
import { messages, t } from '@/lib/i18n';

describe('t (F-064; NFR-14)', () => {
  it('returns the catalog value', () => {
    expect(t('shortcuts.title')).toBe('Keyboard shortcuts');
  });

  it('substitutes named placeholders', () => {
    expect(t('row.copy', { label: 'ref' })).toBe('Copy ref');
    expect(t('row.copied', { label: 'lineage' })).toBe('Copied lineage');
  });

  it('accepts numbers as well as strings', () => {
    // Only interpolation — locale-aware NUMBER formatting stays in lib/format.ts, which knows about
    // grouping and precision. Two implementations of that is how they disagree.
    expect(t('row.copy', { label: 3 })).toBe('Copy 3');
  });

  it('leaves an unmatched placeholder VERBATIM rather than emptying it', () => {
    // A blank is invisible in review; `{label}` on screen is not. Failing loudly beats failing prettily.
    expect(t('row.copy')).toBe('Copy {label}');
    expect(t('row.copy', { wrong: 'x' })).toBe('Copy {label}');
  });

  it('has no key that resolves to an empty string', () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(value, `${key} is empty`).not.toBe('');
    }
  });

  it('has no duplicate VALUES under different keys within a namespace', () => {
    // Two keys with the same English text are not automatically wrong — but inside one namespace it
    // usually means a copy-paste that a translator would later have to disambiguate blind.
    const byNamespace = new Map<string, string[]>();
    for (const [key, value] of Object.entries(messages)) {
      const namespace = key.split('.')[0] ?? '';
      byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), value]);
    }
    for (const [namespace, values] of byNamespace) {
      expect(new Set(values).size, `duplicate copy inside "${namespace}"`).toBe(values.length);
    }
  });
});
