'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LogoIcon } from '@/components/logo';
import { useReducedMotion } from '@/lib/motion';

/**
 * LiveGraph — the hero's living knowledge graph (MARKETING-DESIGN §3.2, ADR-0044).
 * The product category demonstrated, not described: sources flow into the tessera hub,
 * compiled context flows out to agents. Rendered on @xyflow/react (the engine the
 * dashboard trusts, F-043). Simulated telemetry ticks and edge pulses — clearly labeled
 * `demo`. Decorative-interactive: draggable/pannable but keyboard-inert and aria-hidden
 * (the hero provides the text alternative); reduced motion = static layout, frozen values.
 */

const HIDDEN_HANDLE = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0 };

type TileData = { label: string; tone: 'rose' | 'clay' | 'gold' };

function SourceNode({ data }: NodeProps<Node<TileData>>) {
  return (
    <div className="bg-card/90 flex items-center gap-2 rounded-md border px-3 py-2">
      <span
        className={`size-1.5 rounded-full ${
          data.tone === 'rose' ? 'bg-rose' : data.tone === 'gold' ? 'bg-gold' : 'bg-clay'
        }`}
      />
      <span className="text-label text-muted-foreground font-mono whitespace-nowrap">
        {data.label}
      </span>
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
    </div>
  );
}

function AgentNode({ data }: NodeProps<Node<TileData>>) {
  return (
    <div className="bg-card/90 flex items-center gap-2 rounded-md border px-3 py-2">
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <span className="bg-rose size-1.5 rounded-full" />
      <span className="text-label text-muted-foreground font-mono whitespace-nowrap">
        {data.label}
      </span>
    </div>
  );
}

type HubData = { tokens: number };

function HubNode({ data }: NodeProps<Node<HubData>>) {
  return (
    <div className="bg-card border-border-strong flex items-center gap-3 rounded-lg border px-5 py-4">
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <LogoIcon emberId="ember-graph-hub" className="text-foreground size-8" />
      <span className="flex flex-col">
        <span className="text-heading text-foreground font-serif">tessera</span>
        <span className="text-label text-faint-foreground font-mono">
          {data.tokens.toLocaleString('en-US')} tokens served
        </span>
      </span>
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
    </div>
  );
}

const nodeTypes = { source: SourceNode, agent: AgentNode, hub: HubNode };

const SOURCES: Array<{ id: string; label: string; tone: TileData['tone']; y: number }> = [
  { id: 's-repo-api', label: 'repo · api', tone: 'clay', y: 20 },
  { id: 's-repo-web', label: 'repo · web', tone: 'clay', y: 115 },
  { id: 's-git', label: 'git history', tone: 'gold', y: 210 },
  { id: 's-adr', label: 'decisions · ADRs', tone: 'rose', y: 305 },
  { id: 's-memory', label: 'memory · lessons', tone: 'rose', y: 400 },
  { id: 's-docs', label: 'docs · architecture', tone: 'clay', y: 495 },
];

const AGENTS: Array<{ id: string; label: string; y: number }> = [
  { id: 'a-claude', label: 'claude code', y: 80 },
  { id: 'a-cursor', label: 'cursor', y: 205 },
  { id: 'a-cline', label: 'cline', y: 330 },
  { id: 'a-codex', label: 'codex cli', y: 455 },
];

function buildNodes(tokens: number): Node[] {
  return [
    ...SOURCES.map((s) => ({
      id: s.id,
      type: 'source',
      position: { x: 0, y: s.y },
      data: { label: s.label, tone: s.tone },
    })),
    { id: 'hub', type: 'hub', position: { x: 380, y: 235 }, data: { tokens } },
    ...AGENTS.map((a) => ({
      id: a.id,
      type: 'agent',
      position: { x: 800, y: a.y },
      data: { label: a.label, tone: 'rose' as const },
    })),
  ];
}

const EDGE_IDS = [
  ...SOURCES.map((s) => ({ id: `e-${s.id}`, source: s.id, target: 'hub' })),
  ...AGENTS.map((a) => ({ id: `e-${a.id}`, source: 'hub', target: a.id })),
];

function buildEdges(activeId: string | null, animated: boolean): Edge[] {
  return EDGE_IDS.map(({ id, source, target }) => {
    const active = id === activeId;
    return {
      id,
      source,
      target,
      animated: animated && !active,
      style: active
        ? { stroke: 'var(--rose)', strokeWidth: 2 }
        : { stroke: 'var(--border-strong)', strokeWidth: 1.25 },
    };
  });
}

export function LiveGraph() {
  const reduced = useReducedMotion();
  const [tokens, setTokens] = useState(1_284_312);
  const [rpm, setRpm] = useState(212);
  const [agents, setAgents] = useState(34);
  const [activeEdge, setActiveEdge] = useState<string | null>(null);
  const [nodes, , onNodesChange] = useNodesState(buildNodes(1_284_312));

  /* Simulated telemetry — randomized demo data, frozen under reduced motion. */
  useEffect(() => {
    if (reduced) return;
    const tick = setInterval(() => {
      setTokens((value) => value + 600 + Math.floor(Math.random() * 3800));
      setRpm((value) => Math.max(140, Math.min(320, value + Math.floor(Math.random() * 19) - 9)));
      if (Math.random() > 0.82) {
        setAgents((value) => Math.max(24, Math.min(48, value + (Math.random() > 0.5 ? 1 : -1))));
      }
      const next = EDGE_IDS[Math.floor(Math.random() * EDGE_IDS.length)];
      setActiveEdge(next ? next.id : null);
    }, 1600);
    return () => clearInterval(tick);
  }, [reduced]);

  const edges = useMemo(() => buildEdges(activeEdge, !reduced), [activeEdge, reduced]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => (node.id === 'hub' ? { ...node, data: { ...node.data, tokens } } : node)),
    [nodes, tokens],
  );

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        disableKeyboardA11y
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      />
      <div className="pointer-events-none absolute right-5 bottom-5 hidden flex-col items-end gap-1.5 sm:flex">
        <span className="text-label text-muted-foreground bg-card/85 rounded-md border px-2.5 py-1 font-mono">
          {rpm} compile/min
        </span>
        <span className="text-label text-muted-foreground bg-card/85 rounded-md border px-2.5 py-1 font-mono">
          {agents} agents connected
        </span>
        <span className="text-label text-faint-foreground bg-card/85 rounded-md border px-2.5 py-1 font-mono">
          simulated telemetry · demo
        </span>
      </div>
    </div>
  );
}
