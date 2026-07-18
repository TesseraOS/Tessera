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

  // Activity aggregation (F-084). These duplicate cases from the shared `audit-log.conformance` suite
  // for the SAME reason the clamp test above does: this adapter does not run that suite (the F-078
  // gap). The GROUP BY / MIN(at) here is real SQL, so it MUST be verified against the shipping
  // adapter, not only the in-memory reference — the divergence F-078 exists to prevent.
  it('aggregates activity by UTC day, at the store, excluding *.read', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const audit = createSqliteAuditLog(store.db).forTenant('acme');

    await audit.record(event({ action: 'search', at: '2026-03-01T08:00:00.000Z' }));
    await audit.record(event({ action: 'compile', at: '2026-03-01T22:00:00.000Z' }));
    await audit.record(event({ action: 'memory.read', at: '2026-03-01T23:00:00.000Z' })); // read: ignored
    await audit.record(event({ action: 'memory.write', at: '2026-03-04T09:00:00.000Z' }));

    const { buckets } = await audit.activity({
      since: '2026-03-01T00:00:00.000Z',
      until: '2026-03-31T23:59:59.999Z',
    });
    expect(buckets).toEqual([
      { date: '2026-03-01', count: 2 },
      { date: '2026-03-04', count: 1 },
    ]);
  });

  it('buckets by the viewer’s calendar day when tzOffsetMinutes is set — in SQL (F-088)', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const audit = createSqliteAuditLog(store.db).forTenant('acme');

    // The `date(at, '<n> minutes')` modifier is real SQL against the shipping adapter — verified
    // here for the same F-078 reason as the UTC case above. +330 (UTC+5:30): 20:00Z lands on the
    // NEXT local day. -300 (UTC-5): 02:00Z lands on the PREVIOUS local day.
    await audit.record(event({ action: 'compile', at: '2026-03-01T02:00:00.000Z' }));
    await audit.record(event({ action: 'compile', at: '2026-03-01T08:00:00.000Z' }));
    await audit.record(event({ action: 'compile', at: '2026-03-01T20:00:00.000Z' }));

    const plus = await audit.activity({
      since: '2026-03-01T00:00:00.000Z',
      until: '2026-03-31T23:59:59.999Z',
      tzOffsetMinutes: 330,
    });
    expect(plus.buckets).toEqual([
      { date: '2026-03-01', count: 2 },
      { date: '2026-03-02', count: 1 },
    ]);

    const minus = await audit.activity({
      since: '2026-03-01T00:00:00.000Z',
      until: '2026-03-31T23:59:59.999Z',
      tzOffsetMinutes: -300,
    });
    expect(minus.buckets).toEqual([
      { date: '2026-02-28', count: 1 },
      { date: '2026-03-01', count: 2 },
    ]);
  });

  it('reports the retention floor as MIN(at) over all actions, per tenant', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const base = createSqliteAuditLog(store.db);
    const acme = base.forTenant('acme');

    // Oldest for acme is a READ — the floor must still see it.
    await acme.record(event({ action: 'source.read', at: '2026-01-02T00:00:00.000Z' }));
    await acme.record(event({ action: 'compile', at: '2026-03-10T00:00:00.000Z' }));
    // Another tenant's older event must NOT lower acme's floor.
    await base
      .forTenant('globex')
      .record(event({ action: 'compile', at: '2025-06-01T00:00:00.000Z' }));

    const { earliest } = await acme.activity({
      since: '2026-03-01T00:00:00.000Z',
      until: '2026-03-31T23:59:59.999Z',
    });
    expect(earliest).toBe('2026-01-02T00:00:00.000Z');
  });

  it('returns an empty result for a tenant with no trail', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const audit = createSqliteAuditLog(store.db).forTenant('empty');
    expect(
      await audit.activity({
        since: '2026-03-01T00:00:00.000Z',
        until: '2026-03-31T23:59:59.999Z',
      }),
    ).toEqual({ buckets: [], earliest: null });
  });
});
