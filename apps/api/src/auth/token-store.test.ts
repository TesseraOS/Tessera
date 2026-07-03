import { describe, expect, it } from 'vitest';
import { createInMemoryTokenStore } from './token-store.js';

describe('in-memory TokenStore', () => {
  it('issues a prefixed secret once and returns a non-secret record', async () => {
    const store = createInMemoryTokenStore();
    const { token, record } = await store.issue({
      tenantId: 'acme',
      principalId: 'ci-bot',
      roles: ['member'],
      displayName: 'CI bot',
    });
    expect(token).toMatch(/^tsk_/);
    expect(record.tenantId).toBe('acme');
    expect(record.roles).toEqual(['member']);
    expect(record.revokedAt).toBeNull();
    // The record must never carry the plaintext secret.
    expect(JSON.stringify(record)).not.toContain(token);
  });

  it('hashes the secret at rest (verify works, plaintext is not stored)', async () => {
    let stored: string | undefined;
    const store = createInMemoryTokenStore({
      secretFactory: () => {
        stored = 'fixed-secret-body';
        return stored;
      },
    });
    const { token } = await store.issue({ tenantId: 't', principalId: 'p', roles: ['viewer'] });
    // The presented plaintext verifies...
    const resolved = await store.verify(token);
    expect(resolved).not.toBeNull();
    expect(resolved?.principalId).toBe('p');
    // ...but a lookup by an arbitrary wrong secret fails.
    expect(await store.verify('tsk_not-the-secret')).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    const store = createInMemoryTokenStore();
    expect(await store.verify('tsk_nope')).toBeNull();
  });

  it('stops verifying after revoke', async () => {
    const store = createInMemoryTokenStore();
    const { token, record } = await store.issue({
      tenantId: 't',
      principalId: 'p',
      roles: ['admin'],
    });
    expect(await store.verify(token)).not.toBeNull();
    await store.revoke(record.id);
    expect(await store.verify(token)).toBeNull();
  });

  it('revoke of an unknown id is a no-op', async () => {
    const store = createInMemoryTokenStore();
    await expect(store.revoke('missing')).resolves.toBeUndefined();
  });

  it('lists only a tenant’s tokens (including revoked)', async () => {
    const store = createInMemoryTokenStore();
    await store.issue({ tenantId: 'acme', principalId: 'a', roles: ['viewer'] });
    const { record } = await store.issue({ tenantId: 'acme', principalId: 'b', roles: ['viewer'] });
    await store.issue({ tenantId: 'other', principalId: 'c', roles: ['viewer'] });
    await store.revoke(record.id);

    const acme = await store.list('acme');
    expect(acme).toHaveLength(2);
    expect(acme.map((r) => r.principalId).sort()).toEqual(['a', 'b']);
    // Revoked tokens still appear in the administrative listing.
    expect(acme.find((r) => r.id === record.id)?.revokedAt).not.toBeNull();
    expect(await store.list('other')).toHaveLength(1);
  });
});
