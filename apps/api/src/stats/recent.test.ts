import { describe, expect, it } from 'vitest';
import { createInMemoryAuditLog } from '../audit/in-memory.js';
import type { AuditEventInput } from '../audit/model.js';
import { computeRecentActivity, MAX_RECENT_LIMIT } from './recent.js';

/**
 * F-089. The feed is a NARROWED view of the trail: success-only, work actions minus search, and
 * only non-sensitive fields. These drive the real in-memory adapter, so the `actions` filter and
 * the narrowing are tested together.
 */

function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    tenantId: 'default',
    actor: { principalId: 'u', kind: 'user' },
    action: 'compile',
    outcome: 'success',
    at: '2026-07-18T10:00:00.000Z',
    ...overrides,
  };
}

describe('computeRecentActivity', () => {
  it('returns successful work actions newest-first, excluding reads and search', async () => {
    const audit = createInMemoryAuditLog();
    await audit.record(event({ action: 'compile', at: '2026-07-18T10:00:00.000Z' }));
    await audit.record(event({ action: 'search', at: '2026-07-18T10:01:00.000Z' })); // excluded
    await audit.record(event({ action: 'memory.read', at: '2026-07-18T10:02:00.000Z' })); // excluded
    await audit.record(
      event({ action: 'source.manage', target: '/v1/sources', at: '2026-07-18T10:03:00.000Z' }),
    );

    const { events } = await computeRecentActivity(audit, 'default');

    expect(events.map((e) => e.action)).toEqual(['source.manage', 'compile']);
    expect(events[0]?.target).toBe('/v1/sources');
  });

  it('excludes denied attempts — they are a security signal, not feed content', async () => {
    const audit = createInMemoryAuditLog();
    await audit.record(event({ action: 'memory.write', outcome: 'denied' }));
    await audit.record(event({ action: 'memory.write', outcome: 'success' }));

    const { events } = await computeRecentActivity(audit, 'default');

    expect(events).toHaveLength(1);
  });

  it('serves only non-sensitive fields — no outcome, no metadata', async () => {
    const audit = createInMemoryAuditLog();
    await audit.record(event({ metadata: { rows: 3 } }));

    const { events } = await computeRecentActivity(audit, 'default');

    expect(events[0]).toEqual({
      id: expect.any(String) as string,
      action: 'compile',
      actor: { principalId: 'u', kind: 'user' },
      at: '2026-07-18T10:00:00.000Z',
    });
  });

  it('clamps the limit to the hard cap', async () => {
    const audit = createInMemoryAuditLog();
    for (let i = 0; i < MAX_RECENT_LIMIT + 10; i += 1) {
      await audit.record(event({ at: new Date(Date.UTC(2026, 6, 18, 0, 0, i)).toISOString() }));
    }

    const { events } = await computeRecentActivity(audit, 'default', { limit: 500 });

    expect(events).toHaveLength(MAX_RECENT_LIMIT);
  });

  it('is tenant-scoped', async () => {
    const audit = createInMemoryAuditLog();
    await audit.forTenant('a').record(event({}));
    await audit.forTenant('b').record(event({}));

    const { events } = await computeRecentActivity(audit, 'a');

    expect(events).toHaveLength(1);
  });
});
