'use client';

import { ArrowRight, MousePointerClick, Waypoints } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { EffectHit, GraphEdge, GraphNode } from '@/lib/api/types';

/** Resolve a node id to its human key when it is in the loaded subgraph, else a short id. */
function keyOf(id: string, nodesById: Map<string, GraphNode>): string {
  return nodesById.get(id)?.key ?? `${id.slice(0, 8)}…`;
}

export function GraphSidePanel({
  mode,
  node,
  edges,
  nodesById,
  effects,
  effectsPending,
  onInspectEffects,
}: {
  mode: 'explore' | 'effects';
  node: GraphNode | null;
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  effects: EffectHit[];
  effectsPending: boolean;
  onInspectEffects: () => void;
}) {
  if (!node) {
    return (
      <Card className="bg-sidebar border-none p-6 shadow-none dark:ring-0">
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 p-0 text-center text-xs">
          <MousePointerClick className="size-5" aria-hidden="true" />
          {mode === 'effects'
            ? 'Select a node to see what a change to it affects.'
            : 'Select a node to inspect its connections.'}
        </CardContent>
      </Card>
    );
  }

  const connections = edges.filter((edge) => edge.from === node.id || edge.to === node.id);

  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardContent className="space-y-4 p-0">
        <header className="space-y-1.5">
          <Badge variant="secondary" className="h-4 text-[10px] capitalize">
            {node.kind}
          </Badge>
          <p className="text-foreground font-mono text-xs break-all">{node.key}</p>
          {node.label !== node.key ? (
            <p className="text-muted-foreground text-xs">{node.label}</p>
          ) : null}
        </header>

        {mode === 'explore' ? (
          <>
            <section aria-label="Connections" className="space-y-1.5">
              <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Connections ({connections.length})
              </h3>
              {connections.length === 0 ? (
                <p className="text-muted-foreground text-xs">No edges to or from this node.</p>
              ) : (
                <ul className="space-y-1">
                  {connections.slice(0, 20).map((edge) => {
                    const outgoing = edge.from === node.id;
                    const otherId = outgoing ? edge.to : edge.from;
                    return (
                      <li
                        key={edge.id}
                        className="flex items-center gap-1.5 text-[11px]"
                        title={edge.rationale ?? undefined}
                      >
                        <span className="text-muted-foreground font-mono">
                          {outgoing ? '' : keyOf(otherId, nodesById)}
                        </span>
                        <Badge variant="outline" className="h-4 shrink-0 text-[9px]">
                          {edge.kind}
                        </Badge>
                        <ArrowRight
                          className="text-muted-foreground size-3 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-foreground truncate font-mono">
                          {outgoing ? keyOf(otherId, nodesById) : node.key}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              onClick={onInspectEffects}
            >
              <Waypoints className="size-3.5" aria-hidden="true" />
              What does this affect?
            </Button>
          </>
        ) : (
          <section aria-label="Ranked dependents" className="space-y-2">
            <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Affected if this changes
            </h3>
            {effectsPending ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : effects.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Nothing depends on this node (no effect-links reach it).
              </p>
            ) : (
              <ol className="space-y-2">
                {effects.map((hit) => (
                  <li key={hit.nodeId} className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate font-mono text-xs">
                        {hit.node.key}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
                        {hit.distance} hop{hit.distance === 1 ? '' : 's'} · {hit.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 truncate font-mono text-[10px]">
                      {hit.path.map((id) => keyOf(id, nodesById)).join(' → ')}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
