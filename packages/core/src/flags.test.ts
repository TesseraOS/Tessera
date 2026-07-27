import { describe, expect, it } from 'vitest';
import { createStaticFlagProvider } from './flags.js';

const acme = { tenantId: 'acme' };
const other = { tenantId: 'other' };

describe('createStaticFlagProvider', () => {
  it('resolves a flag from its default when the tenant has no override', () => {
    const flags = createStaticFlagProvider([
      { key: 'beta.search', description: 'New ranker', defaultEnabled: true },
    ]);

    expect(flags.evaluate('beta.search', acme)).toBe(true);
    expect(flags.evaluateAll(acme)).toEqual([
      { key: 'beta.search', description: 'New ranker', enabled: true, source: 'default' },
    ]);
  });

  it('lets a tenant override win over the default — the whole point of a rollout', () => {
    const flags = createStaticFlagProvider([
      { key: 'beta.search', defaultEnabled: false, tenants: { acme: true } },
    ]);

    expect(flags.evaluate('beta.search', acme)).toBe(true);
    expect(flags.evaluate('beta.search', other)).toBe(false);
  });

  it('overrides can turn a flag OFF for one tenant, not only on', () => {
    const flags = createStaticFlagProvider([
      { key: 'beta.search', defaultEnabled: true, tenants: { acme: false } },
    ]);

    expect(flags.evaluate('beta.search', acme)).toBe(false);
    expect(flags.evaluate('beta.search', other)).toBe(true);
  });

  it('reports WHY a flag resolved as it did', () => {
    const flags = createStaticFlagProvider([
      { key: 'a', defaultEnabled: true },
      { key: 'b', defaultEnabled: true, tenants: { acme: false } },
    ]);

    expect(flags.evaluateAll(acme).map((f) => [f.key, f.enabled, f.source])).toEqual([
      ['a', true, 'default'],
      ['b', false, 'tenant-override'],
    ]);
  });

  it('an override for a DIFFERENT tenant does not leak into this one', () => {
    const flags = createStaticFlagProvider([
      { key: 'beta.search', defaultEnabled: false, tenants: { acme: true } },
    ]);

    expect(flags.evaluateAll(other)).toEqual([
      { key: 'beta.search', description: '', enabled: false, source: 'default' },
    ]);
  });

  it('an unknown key is false, never true', () => {
    const flags = createStaticFlagProvider([{ key: 'known', defaultEnabled: true }]);

    // A typo must not enable an unfinished feature.
    expect(flags.evaluate('knwon', acme)).toBe(false);
    expect(flags.evaluate('', acme)).toBe(false);
  });

  it('defaults an undeclared value to off', () => {
    const flags = createStaticFlagProvider([{ key: 'bare' }]);

    expect(flags.evaluate('bare', acme)).toBe(false);
    expect(flags.list()).toEqual([
      { key: 'bare', description: '', defaultEnabled: false, tenants: {} },
    ]);
  });

  it('is empty, not broken, when no flags are declared', () => {
    const flags = createStaticFlagProvider();

    expect(flags.list()).toEqual([]);
    expect(flags.evaluateAll(acme)).toEqual([]);
    expect(flags.evaluate('anything', acme)).toBe(false);
  });

  it('rejects a duplicate key instead of letting one declaration silently win', () => {
    expect(() =>
      createStaticFlagProvider([
        { key: 'dupe', defaultEnabled: true },
        { key: 'dupe', defaultEnabled: false },
      ]),
    ).toThrow(/duplicate feature flag "dupe"/);
  });

  it('lists the catalog tenant-independently, and does not expose its internals to mutation', () => {
    const tenants = { acme: true };
    const flags = createStaticFlagProvider([{ key: 'a', defaultEnabled: false, tenants }]);

    tenants.acme = false; // the caller mutates the object it passed in
    expect(flags.evaluate('a', acme)).toBe(true); // the provider copied it
  });
});
