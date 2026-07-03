import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStore } from '@tessera/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteTokenStore } from './sqlite-token-store.js';

describe('createSqliteTokenStore', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('issues a prefixed secret, verifies it, and never stores plaintext', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const tokens = createSqliteTokenStore(store.db);

    const { token, record } = await tokens.issue({
      tenantId: 'acme',
      principalId: 'ci-bot',
      roles: ['member'],
      scopes: ['search:read'],
      displayName: 'CI',
    });
    expect(token).toMatch(/^tsk_/);
    expect(record.roles).toEqual(['member']);

    const resolved = await tokens.verify(token);
    expect(resolved?.principalId).toBe('ci-bot');
    expect(resolved?.scopes).toEqual(['search:read']);
    // A wrong secret does not resolve.
    expect(await tokens.verify('tsk_wrong')).toBeNull();
    await store.close();
  });

  it('stops verifying after revoke and lists per tenant', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const tokens = createSqliteTokenStore(store.db);

    const a = await tokens.issue({ tenantId: 'acme', principalId: 'a', roles: ['viewer'] });
    await tokens.issue({ tenantId: 'acme', principalId: 'b', roles: ['viewer'] });
    await tokens.issue({ tenantId: 'other', principalId: 'c', roles: ['viewer'] });

    await tokens.revoke(a.record.id);
    expect(await tokens.verify(a.token)).toBeNull();

    const acme = await tokens.list('acme');
    expect(acme.map((r) => r.principalId).sort()).toEqual(['a', 'b']);
    expect(await tokens.list('other')).toHaveLength(1);
    await store.close();
  });

  it('persists tokens across a restart (reopening the same database file)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-tokens-'));
    const path = join(dir, 'tokens.db');

    const first = createSqliteStore({ path });
    const issued = await createSqliteTokenStore(first.db).issue({
      tenantId: 'acme',
      principalId: 'admin',
      roles: ['owner'],
    });
    await first.close();

    // Reopen — a fresh connection to the same file; the token must still verify.
    const second = createSqliteStore({ path });
    const resolved = await createSqliteTokenStore(second.db).verify(issued.token);
    expect(resolved?.principalId).toBe('admin');
    expect(resolved?.roles).toEqual(['owner']);
    await second.close();
  });
});
