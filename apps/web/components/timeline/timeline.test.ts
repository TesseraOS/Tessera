import { describe, expect, it } from 'vitest';
import type { LiveEvent } from '@/lib/api/events';
import type { AuditEvent, Memory } from '@/lib/api/types';
import { MEMORY_KIND_LABELS } from '@/lib/memory';
import { buildTimeline } from './timeline';

const memory = (over: Partial<Memory>): Memory => ({
  id: 'm1',
  lineageId: 'l1',
  kind: 'decision',
  title: 'Chose Fastify',
  body: 'because…',
  scope: 'global',
  confidence: 1,
  metadata: {},
  version: 1,
  supersedes: null,
  supersededBy: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const audit: AuditEvent = {
  id: 'a1',
  tenantId: 'default',
  actor: { principalId: 'writer', kind: 'token' },
  action: 'memory.write',
  outcome: 'success',
  at: '2026-07-02T00:00:00.000Z',
};

const auditLabels = { 'memory.write': 'Memory write' };

describe('buildTimeline', () => {
  it('merges sources newest-first and labels audit actions', () => {
    const live: LiveEvent[] = [
      {
        id: 'e1',
        type: 'document.ingested',
        at: '2026-07-03T00:00:00.000Z',
        data: { path: 'src/a.ts' },
      },
    ];

    const entries = buildTimeline({
      memories: [memory({})],
      audit: [audit],
      live,
      auditLabels,
      kindLabels: MEMORY_KIND_LABELS,
    });

    expect(entries.map((entry) => entry.category)).toEqual(['ingest', 'audit', 'memory']);
    expect(entries[1]?.title).toBe('Memory write');
    expect(entries[2]?.kind).toBe('decision');
  });

  it('de-duplicates a live memory.captured already present in the fetched list', () => {
    const live: LiveEvent[] = [
      {
        id: 'e2',
        type: 'memory.captured',
        at: '2026-07-05T00:00:00.000Z',
        data: { lineageId: 'l1', kind: 'decision', title: 'Chose Fastify' },
      },
    ];

    const entries = buildTimeline({
      memories: [memory({ lineageId: 'l1' })],
      audit: [],
      live,
      auditLabels,
      kindLabels: MEMORY_KIND_LABELS,
    });

    // Only the fetched memory remains; the live duplicate for the same lineage is dropped.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.live).toBeUndefined();
  });

  it('keeps a live memory.captured for a lineage not yet in the list, marked live', () => {
    const live: LiveEvent[] = [
      {
        id: 'e3',
        type: 'memory.captured',
        at: '2026-07-05T00:00:00.000Z',
        data: { lineageId: 'l2', kind: 'lesson', title: 'New lesson' },
      },
    ];

    const entries = buildTimeline({
      memories: [memory({ lineageId: 'l1' })],
      audit: [],
      live,
      auditLabels,
      kindLabels: MEMORY_KIND_LABELS,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ live: true, kind: 'lesson', title: 'New lesson' });
  });
});
