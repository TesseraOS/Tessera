import type { LiveEvent } from '@/lib/api/events';
import type { AuditEvent, Memory, MemoryKind } from '@/lib/api/types';

export type TimelineCategory = 'memory' | 'audit' | 'ingest' | 'scan';

export interface TimelineEntry {
  id: string;
  /** ISO timestamp used to order the feed (newest first). */
  at: string;
  category: TimelineCategory;
  title: string;
  detail?: string;
  kind?: MemoryKind;
  /** True for events received live over SSE this session. */
  live?: boolean;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Merge memory lineages, audit events, and live SSE events into one time-ordered feed (FR-43).
 * Pure + deterministic (the unit test drives it directly). Live `memory.captured` events are
 * de-duplicated against the fetched memory list (same lineage) so a just-captured memory shows once.
 */
export function buildTimeline(input: {
  memories: Memory[];
  audit: AuditEvent[];
  live: LiveEvent[];
  auditLabels: Record<string, string>;
  kindLabels: Record<MemoryKind, string>;
}): TimelineEntry[] {
  const { memories, audit, live, auditLabels, kindLabels } = input;
  const entries: TimelineEntry[] = [];
  const memoryLineages = new Set(memories.map((memory) => memory.lineageId));

  for (const memory of memories) {
    entries.push({
      id: `mem-${memory.id}`,
      at: memory.createdAt,
      category: 'memory',
      title: memory.title,
      detail: `${kindLabels[memory.kind]} · v${memory.version} · ${memory.scope}`,
      kind: memory.kind,
    });
  }

  for (const event of audit) {
    entries.push({
      id: `aud-${event.id}`,
      at: event.at,
      category: 'audit',
      title: auditLabels[event.action] ?? event.action,
      detail: `${event.actor.principalId} (${event.actor.kind}) · ${event.outcome}${
        event.target ? ` · ${event.target}` : ''
      }`,
    });
  }

  for (const event of live) {
    if (event.type === 'memory.captured') {
      const lineageId = str(event.data['lineageId']);
      if (lineageId && memoryLineages.has(lineageId)) continue; // already shown from the list
      const kind = str(event.data['kind']) as MemoryKind | undefined;
      entries.push({
        id: `live-${event.id}`,
        at: event.at,
        category: 'memory',
        title: str(event.data['title']) ?? 'Memory captured',
        detail: kind ? `${kindLabels[kind]} · captured` : 'captured',
        ...(kind ? { kind } : {}),
        live: true,
      });
    } else if (event.type === 'document.ingested') {
      const detail = str(event.data['path']) ?? str(event.data['ref']);
      entries.push({
        id: `live-${event.id}`,
        at: event.at,
        category: 'ingest',
        title: 'Document ingested',
        ...(detail ? { detail } : {}),
        live: true,
      });
    } else {
      const summary = event.data['summary'] as
        { added: number; modified: number; removed: number } | undefined;
      const label = str(event.data['label']) ?? 'a source';
      entries.push({
        id: `live-${event.id}`,
        at: event.at,
        category: 'scan',
        title: 'Scan completed',
        detail: summary
          ? `${label}: ${summary.added} added · ${summary.modified} modified · ${summary.removed} removed`
          : label,
        live: true,
      });
    }
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
