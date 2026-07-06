'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { GraphCanvasImplProps } from './graph-canvas-impl';

/**
 * Lazy, code-split React Flow canvas (FR-42). `ssr:false` keeps `@xyflow/react` + its CSS out of the
 * server render and the initial bundle; it loads only when the graph view mounts.
 */
const GraphCanvasImpl = dynamic(() => import('./graph-canvas-impl'), {
  ssr: false,
  loading: () => <Skeleton className="h-[65vh] w-full rounded-xl" />,
});

export type GraphCanvasProps = GraphCanvasImplProps;

export function GraphCanvas(props: GraphCanvasProps) {
  return <GraphCanvasImpl {...props} />;
}
