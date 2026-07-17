import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_AUDIT_PAGE_SIZE, type AuditEventInput } from '@tessera/api';
import { createSqliteStore } from '@tessera/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteAuditLog } from './sqlite-audit-log.js';

let counter = 0;
function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  counter += 1;
  return {
    tenantId: 'default',
    actor: { principalId: 'user-1', kind: 'user' },
    action: 'memory.write',
    outcome: 'success',
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    ...overrides,
  };
}

describe('createSqliteAuditLog', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('clamps an over-large limit and defaults when absent (port contract parity)', async () => {
    // This adapter had `query.limit ?? 50` with NO clamp while the in-memory one clamped to
    // MAX_AUDIT_PAGE_SIZE — a port contract only one adapter honoured. Unreachable over HTTP (the
    // route schema caps it), but the audit-export trail walk calls the PORT directly, below that
    // schema, which is exactly where the divergence lived.
    //
    // NOTE: this assertion duplicates a case in the shared `audit-log.conformance` suite because this
    // adapter does not run it — the port + conformance live in `@tessera/api` and the adapter lives
    // here. That gap is WHY the drift went unseen, and it is registered as its own feature (F-078).
    const store = createSqliteStore({ path: ':memory:' });
    const audit = createSqliteAuditLog(store.db).forTenant('acme');
    for (let i = 0; i < 3; i += 1) await audit.record(event({ target: `c${i}` }));

    const clamped = await audit.query({ limit: MAX_AUDIT_PAGE_SIZE + 500 });
    expect(clamped.events).toHaveLength(3);
    expect(clamped.nextCursor).toBeUndefined();

    expect((await audit.query({})).events).toHaveLength(3);
  });

  it('records newest-first, filters, and isolates by tenant', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const audit = createSqliteAuditLog(store.db);

    const acme = audit.forTenant('acme');
    const globex = audit.forTenant('globex');
    await acme.record(event({ action: 'search' }));
    await acme.record(event({ action: 'memory.write', outcome: 'denied' }));
    await globex.record(event({ action: 'memory.write' }));

    const acmeEvents = (await acme.query()).events;
    expect(acmeEvents.map((e) => e.action)).toEqual(['memory.write', 'search']); // newest-first
    expect(acmeEvents.every((e) => e.tenantId === 'acme')).toBe(true);
    expect((await acme.query({ outcome: 'denied' })).events).toHaveLength(1);

    // globex sees only its own event (cross-tenant isolation).
    const globexEvents = (await globex.query()).events;
    expect(globexEvents).toHaveLength(1);
    expect(globexEvents[0]?.tenantId).toBe('globex');
    await store.close();
  });

  it('paginates with a stable cursor and prunes by age + count (retention)', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const audit = createSqliteAuditLog(store.db).forTenant('acme');

    for (let i = 0; i < 5; i += 1) await audit.record(event({ target: `t${i}` }));
    const page1 = await audit.query({ limit: 2 });
    expect(page1.events).toHaveLength(2);
    const cursor = page1.nextCursor;
    expect(cursor).toBeDefined();
    const page2 = await audit.query(cursor === undefined ? { limit: 2 } : { limit: 2, cursor });
    const seen = [...page1.events, ...page2.events].map((e) => e.target);
    expect(new Set(seen).size).toBe(4); // no overlap

    const prunedByCount = await audit.prune({ maxEntries: 1 });
    expect(prunedByCount).toBe(4);
    expect((await audit.query()).events).toHaveLength(1);

    // Retention by age on a fresh tenant: an old event is pruned, a recent one survives.
    const fresh = createSqliteAuditLog(store.db).forTenant('fresh');
    const now = Date.now();
    await fresh.record(event({ at: new Date(now - 10_000).toISOString() })); // 10s old
    await fresh.record(event({ at: new Date(now).toISOString() })); // current
    const prunedByAge = await fresh.prune({ maxAgeMs: 5_000 });
    expect(prunedByAge).toBe(1); // only the 10s-old event
    expect((await fresh.query()).events).toHaveLength(1);
    await store.close();
  });

  it('persists the trail across a restart (reopening the same database file)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-audit-'));
    const path = join(dir, 'tessera.db');

    const first = createSqliteStore({ path });
    await createSqliteAuditLog(first.db)
      .forTenant('acme')
      .record(event({ action: 'audit.read', actor: { principalId: 'admin', kind: 'token' } }));
    await first.close();

    // Reopen — a fresh connection to the same file; the event must survive.
    const second = createSqliteStore({ path });
    const events = (await createSqliteAuditLog(second.db).forTenant('acme').query()).events;
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('audit.read');
    expect(events[0]?.actor.principalId).toBe('admin');
    await second.close();
  });
});
