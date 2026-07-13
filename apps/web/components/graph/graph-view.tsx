'use client';

import { useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Network, Search, Waypoints } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Constellation } from '@/components/art';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphSidePanel } from '@/components/graph/graph-side-panel';
import { cn } from '@/lib/utils';
import { useEffects, useGraph } from '@/lib/api/hooks';
import { toFlow } from '@/lib/graph-layout';
import { NODE_KINDS, type EffectsQuery, type GraphNode, type NodeKind } from '@/lib/api/types';

const GRAPH_LIMIT = 500;

type Mode = 'explore' | 'effects';

/**
 * Knowledge-graph explorer (FR-42/FR-19) — an explorable React Flow view of the live graph with node
 * filters + search-to-focus, and an **Effects mode** that highlights `get_effects` paths. The side
 * panel (node detail + ranked dependents) is the keyboard-accessible alternative to the canvas.
 */
export function GraphView() {
  const [mode, setMode] = useState<Mode>('explore');
  const [kinds, setKinds] = useState<Set<NodeKind>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  const { data, isPending, isError, error, refetch } = useGraph({
    limit: GRAPH_LIMIT,
    ...(kinds.size > 0 ? { nodeKinds: [...kinds] } : {}),
  });
  const nodes = useMemo(() => data?.nodes ?? [], [data]);
  const edges = useMemo(() => data?.edges ?? [], [data]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  // Effects mode: highlight every node on any path returned by get_effects for the selected node.
  const effectsQuery: EffectsQuery | null =
    mode === 'effects' && selected ? { kind: selected.kind, key: selected.key } : null;
  const effects = useEffects(effectsQuery);
  const highlightNodeIds = useMemo(() => {
    if (mode !== 'effects' || !effects.data) return undefined;
    const ids = new Set<string>();
    if (selectedId) ids.add(selectedId);
    for (const hit of effects.data.effects) for (const id of hit.path) ids.add(id);
    return ids;
  }, [mode, effects.data, selectedId]);

  const flow = useMemo(
    () =>
      toFlow(nodes, edges, {
        ...(highlightNodeIds ? { highlightNodeIds } : {}),
        selectedId: selectedId ?? undefined,
      }),
    [nodes, edges, highlightNodeIds, selectedId],
  );

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) return [];
    return nodes
      .filter(
        (node) =>
          node.key.toLowerCase().includes(query) || node.label.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [nodes, search]);

  const focusNode = (node: GraphNode) => {
    setSelectedId(node.id);
    setSearch('');
  };

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle>Knowledge graph</CardTitle>
          <CardDescription>
            Explore files, symbols, and their effect-links. Switch to Effects mode to see what a
            change ripples to (get_effects), with the reaching paths highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 p-0 pt-4">
          <div
            className="border-border inline-flex rounded-md border p-0.5"
            role="tablist"
            aria-label="Graph mode"
          >
            {(['explore', 'effects'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium capitalize transition-colors',
                  mode === value
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {value === 'explore' ? (
                  <Network className="size-3.5" aria-hidden="true" />
                ) : (
                  <Waypoints className="size-3.5" aria-hidden="true" />
                )}
                {value}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px] flex-1">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search nodes by key or label…"
              aria-label="Search nodes"
              className="h-8 pl-8 text-xs"
            />
            {matches.length > 0 ? (
              <ul className="bg-popover absolute z-10 mt-1 w-full overflow-hidden rounded-md border shadow-md">
                {matches.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => focusNode(node)}
                      className="hover:bg-accent flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                    >
                      <Badge variant="secondary" className="h-4 text-[10px] capitalize">
                        {node.kind}
                      </Badge>
                      <span className="truncate font-mono text-xs">{node.key}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </CardContent>

        <div className="flex flex-wrap items-center gap-1.5 pt-3">
          {NODE_KINDS.map((kind) => {
            const active = kinds.has(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setKinds((prev) => {
                    const next = new Set(prev);
                    if (next.has(kind)) next.delete(kind);
                    else next.add(kind);
                    return next;
                  })
                }
                className={cn(
                  'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium capitalize transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {kind}
              </button>
            );
          })}
        </div>
      </Card>

      {isError ? (
        <ErrorState
          mascot
          title="Could not load the graph"
          description={error instanceof Error ? error.message : 'Is the Tessera API running?'}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <Skeleton className="h-[65vh] w-full rounded-xl" />
      ) : nodes.length === 0 ? (
        <EmptyState
          art={<Constellation />}
          title="The knowledge graph is empty"
          description="Register and scan a source — Tessera extracts code symbols and their relationships into the graph."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            <p className="text-muted-foreground px-1 text-xs">
              {nodes.length} nodes · {edges.length} edges
              {nodes.length >= GRAPH_LIMIT ? ` · showing the first ${GRAPH_LIMIT}` : ''}
            </p>
            <GraphCanvas
              nodes={flow.nodes}
              edges={flow.edges}
              onSelect={setSelectedId}
              reducedMotion={reducedMotion}
            />
          </div>
          <GraphSidePanel
            mode={mode}
            node={selected}
            edges={edges}
            nodesById={byId}
            effects={effects.data?.effects ?? []}
            effectsPending={mode === 'effects' && effects.isPending && selected !== null}
            onInspectEffects={() => setMode('effects')}
          />
        </div>
      )}
    </div>
  );
}
