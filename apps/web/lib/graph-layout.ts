import type { Edge, Node } from '@xyflow/react';
import { NODE_KINDS, type GraphEdge, type GraphNode, type NodeKind } from '@/lib/api/types';

/** Data carried on each flow node (read by the custom node renderer). */
export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  nodeKey: string;
  highlighted: boolean;
  dimmed: boolean;
}

export interface FlowEdgeData extends Record<string, unknown> {
  kind: GraphEdge['kind'];
  rationale: string | null;
  confidence: number | null;
  highlighted: boolean;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<FlowEdgeData>;

export interface ToFlowOptions {
  /** Node ids on a highlighted effect path — highlighted; everything else is dimmed. */
  readonly highlightNodeIds?: ReadonlySet<string>;
  /** The currently selected node id. */
  readonly selectedId?: string | undefined;
}

const COLUMNS = 6;
const COL_WIDTH = 220;
const ROW_HEIGHT = 68;
const KIND_ORDER = new Map(NODE_KINDS.map((kind, index) => [kind, index]));

/**
 * Deterministic O(n) domain→React-Flow transform (pure — unit-tested without a canvas). Nodes are
 * sorted by kind then key and laid out in a grid, so kinds cluster (color-coded); edges are drawn
 * between them (effect-links styled distinctly). With `highlightNodeIds` (Effects mode), on-path
 * nodes/edges are highlighted and the rest dimmed, so the reaching paths stand out.
 */
export function toFlow(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  options: ToFlowOptions = {},
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const { highlightNodeIds, selectedId } = options;
  const highlighting = highlightNodeIds !== undefined && highlightNodeIds.size > 0;

  const sorted = [...nodes].sort((a, b) => {
    const byKind = (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0);
    return byKind !== 0 ? byKind : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const present = new Set(sorted.map((node) => node.id));
  const flowNodes: FlowNode[] = sorted.map((node, index) => {
    const highlighted = highlighting ? (highlightNodeIds?.has(node.id) ?? false) : false;
    return {
      id: node.id,
      type: 'graphNode',
      position: { x: (index % COLUMNS) * COL_WIDTH, y: Math.floor(index / COLUMNS) * ROW_HEIGHT },
      data: {
        label: node.label || node.key,
        kind: node.kind,
        nodeKey: node.key,
        highlighted: highlighted || node.id === selectedId,
        dimmed: highlighting && !highlighted && node.id !== selectedId,
      },
      selected: node.id === selectedId,
    };
  });

  const flowEdges: FlowEdge[] = edges
    .filter((edge) => present.has(edge.from) && present.has(edge.to))
    .map((edge) => {
      const highlighted =
        highlighting &&
        (highlightNodeIds?.has(edge.from) ?? false) &&
        (highlightNodeIds?.has(edge.to) ?? false);
      const isEffect = edge.kind === 'EFFECT_LINK';
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        animated: isEffect && highlighted,
        className: [
          isEffect ? 'edge-effect' : 'edge-structural',
          highlighted ? 'edge-highlight' : '',
        ]
          .filter(Boolean)
          .join(' '),
        data: {
          kind: edge.kind,
          rationale: edge.rationale,
          confidence: edge.confidence,
          highlighted,
        },
      };
    });

  return { nodes: flowNodes, edges: flowEdges };
}
