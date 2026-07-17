import { describe, expect, it } from 'vitest';
import { collectAuditTrail } from './collect.js';
import { createInMemoryAuditLog } from './in-memory.js';
import { MAX_AUDIT_PAGE_SIZE, type AuditEventInput } from './model.js';

let counter = 0;
function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  counter += 1;
  return {
    tenantId: 'acme',
    actor: { principalId: 'admin', kind: 'user' },
    action: 'memory.write',
    outcome: 'success',
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    ...overrides,
  };
}

async function seed(count: number, overrides: Partial<AuditEventInput> = {}) {
  const log = createInMemoryAuditLog();
  for (let i = 0; i < count; i += 1) await log.record(event({ target: `t${i}`, ...overrides }));
  return log;
}

describe('collectAuditTrail', () => {
  it('follows the cursor to completeness, well past one page', async () => {
    // The whole point: `query` is paginated BY CONTRACT, so a caller that reads one page and calls it
    // "the trail" is wrong about what the trail is. Completeness is a fact, and this is where it is
    // established — which is why it cannot be delegated to a client holding 2 of 40 pages.
    const log = await seed(MAX_AUDIT_PAGE_SIZE * 2 + 7);

    const { events, truncated } = await collectAuditTrail(log);

    expect(events).toHaveLength(MAX_AUDIT_PAGE_SIZE * 2 + 7);
    expect(truncated).toBe(false);
    expect(new Set(events.map((e) => e.target)).size).toBe(events.length); // no duplicates, no gaps
  });

  it('applies filters to every page, not just the first', async () => {
    const log = createInMemoryAuditLog();
    for (let i = 0; i < 120; i += 1) {
      await log.record(event({ action: i % 2 === 0 ? 'memory.write' : 'audit.read' }));
    }

    const { events } = await collectAuditTrail(log, { action: 'audit.read' });

    expect(events).toHaveLength(60);
    expect(events.every((e) => e.action === 'audit.read')).toBe(true);
  });

  it('caps the walk and SAYS it was truncated', async () => {
    const log = await seed(50);

    const { events, truncated } = await collectAuditTrail(log, {}, 20);

    expect(events).toHaveLength(20);
    // A truncated export that says so is honest; a silent one is the trap. The caller can narrow.
    expect(truncated).toBe(true);
  });

  it('is not truncated when the trail is exactly the cap', async () => {
    const log = await seed(20);
    const { events, truncated } = await collectAuditTrail(log, {}, 20);

    expect(events).toHaveLength(20);
    // Off-by-one guard: exactly-at-cap is COMPLETE, and claiming otherwise would send an admin
    // hunting for rows that do not exist.
    expect(truncated).toBe(false);
  });

  it('walks everything when the cap is disabled (the DSR contract)', async () => {
    // A right-of-access answer must be complete or it is not an answer.
    const log = await seed(MAX_AUDIT_PAGE_SIZE + 25);
    const { events, truncated } = await collectAuditTrail(log, {}, undefined);

    expect(events).toHaveLength(MAX_AUDIT_PAGE_SIZE + 25);
    expect(truncated).toBe(false);
  });

  it('returns an empty, non-truncated result for an empty trail', async () => {
    const { events, truncated } = await collectAuditTrail(createInMemoryAuditLog());
    expect(events).toEqual([]);
    expect(truncated).toBe(false);
  });

  it('walks only the log it is handed — scoping is the caller job', async () => {
    const log = createInMemoryAuditLog();
    await log.forTenant('acme').record(event({ tenantId: 'acme' }));
    await log.forTenant('globex').record(event({ tenantId: 'globex' }));

    const { events } = await collectAuditTrail(log.forTenant('globex'));

    // An unscoped log here would exfiltrate the whole deployment's trail in one call.
    expect(events).toHaveLength(1);
    expect(events[0]?.tenantId).toBe('globex');
  });
});
