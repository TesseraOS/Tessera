'use client';

import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import type { NodeKind } from '@/lib/api/types';
import type { FlowEdge, FlowNode } from '@/lib/graph-layout';

/** Stable accent per node kind (design-system chart palette, tokens only). */
const KIND_ACCENT: Record<NodeKind, string> = {
  file: 'var(--chart-1)',
  symbol: 'var(--chart-2)',
  module: 'var(--chart-3)',
  person: 'var(--chart-4)',
  decision: 'var(--chart-5)',
  memory: 'var(--chart-1)',
};

/** A compact, token-themed graph node with a kind dot + label + connection handles. */
function GraphFlowNode({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] shadow-xs transition-opacity',
        data.highlighted && 'ring-primary ring-2',
        data.dimmed && 'opacity-25',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border" />
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: KIND_ACCENT[data.kind] }}
        aria-hidden="true"
      />
      <span className="max-w-[140px] truncate font-medium">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border" />
    </div>
  );
}

const nodeTypes: NodeTypes = { graphNode: GraphFlowNode };

export interface GraphCanvasImplProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onSelect: (id: string | null) => void;
  reducedMotion: boolean;
}

/**
 * The heavy React Flow canvas (client-only, lazy-loaded — see `graph-canvas.tsx`). Viewport culling
 * (`onlyRenderVisibleElements`) keeps large graphs responsive; nodes are read-only (no drag/connect).
 */
export default function GraphCanvasImpl({
  nodes,
  edges,
  onSelect,
  reducedMotion,
}: GraphCanvasImplProps) {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const fitViewOptions = useMemo(
    () => ({ padding: 0.2, duration: reducedMotion ? 0 : 300 }),
    [reducedMotion],
  );

  return (
    <div className="h-[65vh] w-full overflow-hidden rounded-xl border" aria-label="Knowledge graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        fitView
        fitViewOptions={fitViewOptions}
        onlyRenderVisibleElements
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.1}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-sidebar" />
      </ReactFlow>
    </div>
  );
}
