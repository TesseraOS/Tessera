import { describe, expect, it } from 'vitest';
import { MAX_AUDIT_PAGE_SIZE, type AuditEventInput } from './model.js';
import type { AuditLog } from './port.js';

export interface AuditLogHarness {
  log: AuditLog;
  cleanup?: () => Promise<void>;
}

/** Builds a fresh, isolated {@link AuditLog} per test. */
export type AuditLogFactory = () => Promise<AuditLogHarness>;

let counter = 0;

/** An AuditEventInput with sensible defaults; override any field. */
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

/** The behavioral contract every {@link AuditLog} adapter must satisfy (ADR-0034). */
export function runAuditLogConformance(name: string, makeLog: AuditLogFactory): void {
  describe(`AuditLog conformance: ${name}`, () => {
    it('records events and returns them newest-first', async () => {
      const { log, cleanup } = await makeLog();
      try {
        await log.record(event({ action: 'search' }));
        await log.record(event({ action: 'memory.write' }));
        const { events } = await log.query();
        expect(events.map((e) => e.action)).toEqual(['memory.write', 'search']);
        expect(events.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
      } finally {
        await cleanup?.();
      }
    });

    it('filters by action, actor, and outcome', async () => {
      const { log, cleanup } = await makeLog();
      try {
        await log.record(event({ action: 'search', actor: { principalId: 'a', kind: 'user' } }));
        await log.record(
          event({ action: 'memory.write', actor: { principalId: 'b', kind: 'user' } }),
        );
        await log.record(
          event({
            action: 'memory.write',
            actor: { principalId: 'b', kind: 'user' },
            outcome: 'denied',
          }),
        );

        expect((await log.query({ action: 'search' })).events).toHaveLength(1);
        expect((await log.query({ actor: 'b' })).events).toHaveLength(2);
        expect((await log.query({ outcome: 'denied' })).events).toHaveLength(1);
        expect(
          (await log.query({ action: 'memory.write', outcome: 'success' })).events,
        ).toHaveLength(1);
      } finally {
        await cleanup?.();
      }
    });

    it('filters by a time window (since/until, inclusive)', async () => {
      const { log, cleanup } = await makeLog();
      try {
        const t = (s: number): string => new Date(Date.UTC(2026, 5, 1, 0, 0, s)).toISOString();
        await log.record(event({ at: t(10) }));
        await log.record(event({ at: t(20) }));
        await log.record(event({ at: t(30) }));
        const { events } = await log.query({ since: t(20), until: t(30) });
        expect(events.map((e) => e.at)).toEqual([t(30), t(20)]);
      } finally {
        await cleanup?.();
      }
    });

    it('clamps an over-large limit to MAX_AUDIT_PAGE_SIZE and defaults when absent', async () => {
      // The adapters DIVERGED here undetected: in-memory clamped, SQLite did `query.limit ?? 50`
      // with no bound. Not reachable over HTTP (the route schema caps it), but any caller reaching
      // the PORT directly — like the audit-export trail walk — sits below that schema. A port
      // contract that only one adapter honours is not a contract.
      const { log, cleanup } = await makeLog();
      try {
        for (let i = 0; i < 3; i += 1) await log.record(event({ target: `c${i}` }));

        const clamped = await log.query({ limit: MAX_AUDIT_PAGE_SIZE + 500 });
        expect(clamped.events).toHaveLength(3);
        expect(clamped.nextCursor).toBeUndefined();

        const defaulted = await log.query({});
        expect(defaulted.events).toHaveLength(3);
      } finally {
        await cleanup?.();
      }
    });

    it('paginates newest-first with a stable cursor across appends', async () => {
      const { log, cleanup } = await makeLog();
      try {
        for (let i = 0; i < 5; i += 1) await log.record(event({ target: `t${i}` }));
        const page1 = await log.query({ limit: 2 });
        expect(page1.events).toHaveLength(2);
        const cursor = page1.nextCursor;
        expect(cursor).toBeDefined();

        // A new event after page 1 must NOT shift the cursor's view.
        await log.record(event({ target: 'later' }));

        const page2 = await log.query(cursor === undefined ? { limit: 2 } : { limit: 2, cursor });
        expect(page2.events).toHaveLength(2);
        const seen = [...page1.events, ...page2.events].map((e) => e.target);
        expect(new Set(seen).size).toBe(4); // no overlap between pages
        expect(seen).not.toContain('later');
      } finally {
        await cleanup?.();
      }
    });

    it('prunes by max age and by max entries (retention)', async () => {
      const { log, cleanup } = await makeLog();
      try {
        const now = Date.now();
        await log.record(event({ at: new Date(now - 10_000).toISOString() }));
        await log.record(event({ at: new Date(now - 1_000).toISOString() }));
        await log.record(event({ at: new Date(now).toISOString() }));

        const prunedByAge = await log.prune({ maxAgeMs: 5_000 });
        expect(prunedByAge).toBe(1);
        expect((await log.query()).events).toHaveLength(2);

        const prunedByCount = await log.prune({ maxEntries: 1 });
        expect(prunedByCount).toBe(1);
        const { events } = await log.query();
        expect(events).toHaveLength(1);
        expect(events[0]?.at).toBe(new Date(now).toISOString()); // kept the newest
      } finally {
        await cleanup?.();
      }
    });

    it('isolates trails by tenant (forTenant) — no cross-tenant reads', async () => {
      const { log, cleanup } = await makeLog();
      try {
        const a = log.forTenant('tenant-a');
        const b = log.forTenant('tenant-b');
        // A record stamps the bound tenant even if the input says otherwise.
        await a.record(event({ tenantId: 'tenant-b', action: 'search' }));
        await b.record(event({ action: 'memory.write' }));

        const aEvents = (await a.query()).events;
        expect(aEvents).toHaveLength(1);
        expect(aEvents[0]?.action).toBe('search');
        expect(aEvents[0]?.tenantId).toBe('tenant-a');

        const bEvents = (await b.query()).events;
        expect(bEvents).toHaveLength(1);
        expect(bEvents[0]?.action).toBe('memory.write');

        // The default (base) view is a distinct tenant and sees neither.
        expect((await log.query()).events).toHaveLength(0);
      } finally {
        await cleanup?.();
      }
    });
  });
}
