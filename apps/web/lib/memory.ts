import type { MemoryKind } from '@/lib/api/types';

/** Human labels for the memory kinds (FR-10), in catalog order. */
export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  decision: 'Decision',
  lesson: 'Lesson',
  incident: 'Incident',
  failure: 'Failure',
  architecture: 'Architecture',
  glossary: 'Glossary',
  task: 'Task',
};

/**
 * A stable accent per kind, drawn from the design-system chart palette (tokens only). Used as a thin
 * left rule / dot so kinds are scannable without relying on color alone (label is always present).
 */
export const MEMORY_KIND_ACCENT: Record<MemoryKind, string> = {
  decision: 'var(--chart-1)',
  lesson: 'var(--chart-2)',
  incident: 'var(--chart-3)',
  failure: 'var(--chart-4)',
  architecture: 'var(--chart-5)',
  glossary: 'var(--chart-1)',
  task: 'var(--chart-2)',
};

/** Client-only absolute timestamp (avoids SSR hydration mismatch; data resolves after mount). */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
