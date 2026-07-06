import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '@/lib/api/types';
import { toFlow } from '@/lib/graph-layout';

const node = (id: string, kind: GraphNode['kind'], key: string): GraphNode => ({
  id,
  kind,
  key,
  label: key,
  metadata: {},
});

const edge = (id: string, from: string, to: string, kind: GraphEdge['kind']): GraphEdge => ({
  id,
  from,
  to,
  kind,
  rationale: null,
  confidence: null,
  origin: null,
  metadata: {},
});

describe('toFlow', () => {
  it('lays out nodes by kind then key and styles effect edges', () => {
    const { nodes, edges } = toFlow(
      [node('s1', 'symbol', 'helper'), node('f1', 'file', 'app.ts'), node('f2', 'file', 'b.ts')],
      [edge('e1', 'f1', 'f2', 'imports'), edge('e2', 'f2', 'f1', 'EFFECT_LINK')],
    );

    // Sorted: files (by key: app.ts < b.ts) before symbols.
    expect(nodes.map((n) => n.id)).toEqual(['f1', 'f2', 's1']);
    expect(nodes[0]?.type).toBe('graphNode');
    const effect = edges.find((e) => e.id === 'e2');
    expect(effect?.className).toContain('edge-effect');
    expect(edges.find((e) => e.id === 'e1')?.className).toContain('edge-structural');
  });

  it('highlights nodes/edges on a path and dims the rest (Effects mode)', () => {
    const { nodes, edges } = toFlow(
      [node('a', 'file', 'a.ts'), node('b', 'file', 'b.ts'), node('c', 'file', 'c.ts')],
      [edge('ab', 'a', 'b', 'EFFECT_LINK'), edge('bc', 'b', 'c', 'imports')],
      { highlightNodeIds: new Set(['a', 'b']) },
    );

    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId['a']?.data.highlighted).toBe(true);
    expect(byId['c']?.data.dimmed).toBe(true);
    expect(edges.find((e) => e.id === 'ab')?.data?.highlighted).toBe(true);
    expect(edges.find((e) => e.id === 'bc')?.data?.highlighted).toBe(false);
  });

  it('drops edges whose endpoints are not both present (coherent subgraph)', () => {
    const { edges } = toFlow([node('a', 'file', 'a.ts')], [edge('ax', 'a', 'x', 'imports')]);
    expect(edges).toHaveLength(0);
  });

  it('handles a 5k-node graph within a time budget (level-of-detail transform)', () => {
    const bigNodes = Array.from({ length: 5000 }, (_, i) => node(`n${i}`, 'symbol', `sym${i}`));
    const bigEdges = Array.from({ length: 4999 }, (_, i) =>
      edge(`e${i}`, `n${i}`, `n${i + 1}`, 'imports'),
    );

    const start = performance.now();
    const flow = toFlow(bigNodes, bigEdges);
    const elapsed = performance.now() - start;

    expect(flow.nodes).toHaveLength(5000);
    expect(flow.edges).toHaveLength(4999);
    expect(elapsed).toBeLessThan(500);
  });
});
