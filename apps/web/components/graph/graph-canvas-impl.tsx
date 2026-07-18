'use client';

import { useMemo } from 'react';
import {
  Background,
  Handle,
  Panel,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { KIND_ACCENT } from '@/components/graph/kind-accent';
import type { FlowEdge, FlowNode } from '@/lib/graph-layout';

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
  /** Canvas metadata (e.g. "512 nodes · 87 edges"), drawn as a chip on the canvas itself (F-090). */
  statsLabel?: string | undefined;
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
  statsLabel,
}: GraphCanvasImplProps) {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const fitViewOptions = useMemo(
    // A CLAMPED fit (F-090, user item 7): plain fitView shrinks a 500-node graph to confetti to
    // capture all of it. `minZoom` floors the initial view at a readable scale (a large graph opens
    // centered and legible; the rest is one scroll away), and `maxZoom: 1` keeps a three-node graph
    // from ballooning. Only the DEFAULT is clamped — the user's manual zoom range is untouched.
    () => ({ padding: 0.2, minZoom: 0.6, maxZoom: 1, duration: reducedMotion ? 0 : 300 }),
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
        /*
         * Attribution stays (maintainer decision, 2026-07-17). @xyflow/react is MIT, so hiding it is
         * legally permitted — but xyflow asks that you subscribe to React Flow Pro if you do, and
         * this repo keeps its attributions (NOTICE.md; ADR-0013/0021/0038). F-082 makes it read as a
         * discreet credit rather than a badge; it is styled in `globals.css`, since the element is
         * rendered by the library and not by us.
         */
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={16} />
        {statsLabel !== undefined ? (
          // Canvas metadata belongs on the canvas (F-090): as a sibling line above it, it pushed
          // the whole column ~24px below the side panel — the misalignment the report named.
          <Panel
            position="top-left"
            className="bg-background/80 text-muted-foreground rounded-md border px-2 py-1 text-[11px] tabular-nums backdrop-blur"
          >
            {statsLabel}
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
}
