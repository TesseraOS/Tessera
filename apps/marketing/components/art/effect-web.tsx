'use client';

import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useReducedMotion } from '@/lib/motion';

/**
 * EffectWeb (MARKETING-DESIGN §3.6): get_effects rendered on the graph engine — a
 * contract and the dependents it would break, edges alive. Non-interactive miniature
 * (fixed layout, no pan/zoom/drag); aria-hidden with the row text as the alternative.
 */

const HIDDEN_HANDLE = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0 };

function ChipNode({ data }: NodeProps<Node<{ label: string; hub?: boolean }>>) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
        data.hub ? 'bg-card border-border-strong' : 'bg-card/90'
      }`}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <span className={`size-1.5 rounded-full ${data.hub ? 'bg-gold' : 'bg-rose'}`} />
      <span className="text-label text-muted-foreground font-mono whitespace-nowrap">
        {data.label}
      </span>
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
    </div>
  );
}

const nodeTypes = { chip: ChipNode };

const NODES: Node[] = [
  { id: 'edit', type: 'chip', position: { x: 0, y: 104 }, data: { label: 'edit' } },
  {
    id: 'contract',
    type: 'chip',
    position: { x: 170, y: 100 },
    data: { label: 'TokenStore · contract', hub: true },
  },
  { id: 'd1', type: 'chip', position: { x: 470, y: 12 }, data: { label: 'refresh.ts' } },
  { id: 'd2', type: 'chip', position: { x: 470, y: 104 }, data: { label: 'api/session.ts' } },
  { id: 'd3', type: 'chip', position: { x: 470, y: 196 }, data: { label: 'sdk/client.ts' } },
];

export function EffectWeb() {
  const reduced = useReducedMotion();

  const edges: Edge[] = [
    {
      id: 'e0',
      source: 'edit',
      target: 'contract',
      animated: false,
      style: { stroke: 'var(--border-strong)', strokeWidth: 1.25 },
    },
    ...(['d1', 'd2', 'd3'] as const).map((id) => ({
      id: `e-${id}`,
      source: 'contract',
      target: id,
      animated: !reduced,
      style: { stroke: 'var(--rose)', strokeWidth: 1.5 },
    })),
  ];

  return (
    <div className="relative h-64 w-full md:h-72" aria-hidden="true">
      <ReactFlow
        nodes={NODES}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        disableKeyboardA11y
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      />
      <p className="text-label text-faint-foreground pointer-events-none absolute bottom-1 left-1 font-mono">
        get_effects → 3 dependents · before the edit
      </p>
    </div>
  );
}
