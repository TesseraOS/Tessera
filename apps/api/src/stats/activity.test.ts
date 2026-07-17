import { describe, expect, it } from 'vitest';
import { createInMemoryAuditLog } from '../audit/in-memory.js';
import type { AuditEventInput } from '../audit/model.js';
import { computeWorkspaceActivity } from './activity.js';

/**
 * F-084 / ADR-0053 clause 3. The helper's whole job is the honest window: never start the series
 * earlier than the trail can prove, and zero-fill only inside it. These drive the real in-memory
 * adapter (not a stub), so the aggregation and the windowing are tested together.
 */

const NOW = Date.parse('2026-03-31T12:00:00.000Z');

function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    tenantId: 'default',
    actor: { principalId: 'u', kind: 'user' },
    action: 'compile',
    outcome: 'success',
    at: '2026-03-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('computeWorkspaceActivity', () => {
  it('zero-fills the gap days inside the window and counts work per UTC day', async () => {
    const audit = createInMemoryAuditLog();
    await audit.record(event({ action: 'search', at: '2026-03-29T08:00:00.000Z' }));
    await audit.record(event({ action: 'compile', at: '2026-03-29T09:00:00.000Z' }));
    await audit.record(event({ action: 'memory.write', at: '2026-03-31T09:00:00.000Z' }));

    const { points } = await computeWorkspaceActivity(audit, 'default', { days: 5, now: NOW });

    // The window is clamped to the oldest event (03-29 — later than the requested 03-27), and 03-30
    // is present as a real 0 between the two active days. That gap-fill is the point: a day inside the
    // proven window with no work honestly reads 0.
    expect(points).toEqual([
      { date: '2026-03-29', count: 2 },
      { date: '2026-03-30', count: 0 },
      { date: '2026-03-31', count: 1 },
    ]);
  });

  it('never starts earlier than the trail can prove — the anti-lie test', async () => {
    // The trail's oldest event is 3 days ago, but the request asks for 30. A naive histogram would
    // draw 27 zeros for days whose records never existed (or were pruned). `from` must be the trail's
    // floor, not the request's.
    const audit = createInMemoryAuditLog();
    await audit.record(event({ action: 'compile', at: '2026-03-29T10:00:00.000Z' }));

    const { from, until, points } = await computeWorkspaceActivity(audit, 'default', {
      days: 30,
      now: NOW,
    });

    expect(from).toBe('2026-03-29'); // clamped to the oldest event, NOT 2026-03-02
    expect(until).toBe('2026-03-31');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ date: '2026-03-29', count: 1 });
  });

  it('honours the request when the trail goes back further than asked', async () => {
    const audit = createInMemoryAuditLog();
    await audit.record(event({ action: 'compile', at: '2026-01-01T10:00:00.000Z' })); // old
    await audit.record(event({ action: 'compile', at: '2026-03-30T10:00:00.000Z' }));

    const { from, points } = await computeWorkspaceActivity(audit, 'default', {
      days: 5,
      now: NOW,
    });

    // The trail reaches back to January, but a 5-day request starts 5 days ago — the request wins.
    expect(from).toBe('2026-03-27');
    expect(points).toHaveLength(5);
    // The January event is outside the window and must not appear.
    expect(points.some((p) => p.date < '2026-03-27')).toBe(false);
  });

  it('returns no points for an empty trail, so the chart stays hidden', async () => {
    const audit = createInMemoryAuditLog();
    const result = await computeWorkspaceActivity(audit, 'default', { days: 30, now: NOW });
    expect(result.points).toEqual([]);
  });

  it('is tenant-scoped — one tenant never counts another', async () => {
    const audit = createInMemoryAuditLog();
    await audit.forTenant('a').record(event({ action: 'compile', at: '2026-03-30T10:00:00.000Z' }));
    await audit.forTenant('b').record(event({ action: 'compile', at: '2026-03-30T10:00:00.000Z' }));

    const a = await computeWorkspaceActivity(audit, 'a', { days: 5, now: NOW });
    expect(a.points.reduce((sum, p) => sum + p.count, 0)).toBe(1);
  });
});
