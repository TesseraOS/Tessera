import type { NodeKind } from '@/lib/api/types';

/**
 * Stable accent per node kind (design-system chart palette, tokens only). Shared by the canvas
 * nodes and the side panel's legend/rows (F-090), and deliberately in its own light module: the
 * panel must not import the canvas implementation, which carries `@xyflow/react` + its CSS.
 */
export const KIND_ACCENT: Record<NodeKind, string> = {
  file: 'var(--chart-1)',
  symbol: 'var(--chart-2)',
  module: 'var(--chart-3)',
  person: 'var(--chart-4)',
  decision: 'var(--chart-5)',
  memory: 'var(--chart-1)',
};
