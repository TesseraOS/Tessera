'use client';

import { ArrowDownLeft, ArrowUpRight, MousePointerClick, Waypoints, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KIND_ACCENT } from '@/components/graph/kind-accent';
import { NODE_KINDS, type EffectHit, type GraphEdge, type GraphNode } from '@/lib/api/types';

/** Resolve a node id to its human key when it is in the loaded subgraph, else a short id. */
function keyOf(id: string, nodesById: Map<string, GraphNode>): string {
  return nodesById.get(id)?.key ?? `${id.slice(0, 8)}…`;
}

/** How many connection rows each direction group shows before an honest "+N more" line. */
const CONNECTIONS_CAP = 12;

/** The canvas's kind accent as a small dot — the same encoding, so panel and canvas read as one. */
function KindDot({ kind }: { kind: GraphNode['kind'] }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: KIND_ACCENT[kind] }}
      aria-hidden="true"
    />
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
      {children}
    </h3>
  );
}

/**
 * The graph inspector panel (F-090 overhaul; FR-42/FR-19) — the keyboard-accessible alternative to
 * the canvas, standing level with it: same height, internal scroll (the F-082 cap kept).
 *
 * What changed from the pre-F-090 panel, and why:
 * - **The empty state teaches.** The kind→color legend existed nowhere; it lives here now, so the
 *   canvas's dots are readable without guessing.
 * - **Connections are navigation.** Rows were inert text; they are now buttons that select the
 *   other node, grouped by direction with honest "+N more" caps.
 * - **Effects read as a ranking.** Score meters against the top hit, flat rows with dividers — no
 *   nested bordered boxes (the F-086 lesson).
 */
export function GraphSidePanel({
  mode,
  node,
  edges,
  nodesById,
  effects,
  effectsPending,
  onInspectEffects,
  onSelect,
  onClose,
}: {
  mode: 'explore' | 'effects';
  node: GraphNode | null;
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  effects: EffectHit[];
  effectsPending: boolean;
  onInspectEffects: () => void;
  /** Select another node (connection/effect rows navigate the panel). */
  onSelect: (id: string) => void;
  /** Clear the selection (mirrors clicking the canvas background). */
  onClose: () => void;
}) {
  return (
    /*
     * Same position, same size as the canvas (F-090, user item 8): `lg:h-[65vh]` — not `max-h` —
     * so the two columns top-align and bottom-align, with this panel scrolling internally (the
     * F-082 fix). `role="region"` + `tabIndex` keep the scrollable region keyboard-reachable
     * (axe `scrollable-region-focusable`, WCAG 2.1.1).
     */
    <Card
      className="bg-sidebar gap-0 border-none p-4 shadow-none lg:h-[65vh] lg:overflow-y-auto dark:ring-0"
      role="region"
      aria-label="Node details"
      tabIndex={0}
    >
      {node === null ? (
        <EmptyPanel mode={mode} />
      ) : (
        <CardContent className="space-y-5 p-0">
          <header className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
                <KindDot kind={node.kind} />
                {node.kind}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 size-6"
                onClick={onClose}
                aria-label="Clear selection"
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <p className="text-foreground font-mono text-xs break-all">{node.key}</p>
            {node.label !== node.key ? (
              <p className="text-muted-foreground text-xs">{node.label}</p>
            ) : null}
          </header>

          {mode === 'explore' ? (
            <ExploreDetail
              node={node}
              edges={edges}
              nodesById={nodesById}
              onSelect={onSelect}
              onInspectEffects={onInspectEffects}
            />
          ) : (
            <EffectsDetail
              effects={effects}
              effectsPending={effectsPending}
              nodesById={nodesById}
              onSelect={onSelect}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * No selection: full-height guidance + the node-kind legend — the one place the canvas's color
 * encoding is written down (F-090).
 */
function EmptyPanel({ mode }: { mode: 'explore' | 'effects' }) {
  return (
    <CardContent className="flex h-full flex-col justify-between gap-6 p-0">
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs">
        <MousePointerClick className="size-5" aria-hidden="true" />
        <p className="max-w-[26ch] leading-relaxed">
          {mode === 'effects'
            ? 'Select a node to see what a change to it affects.'
            : 'Select a node — or search above — to inspect its connections.'}
        </p>
      </div>
      <section aria-label="Node kinds" className="space-y-2">
        <SectionHeading>Legend</SectionHeading>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {NODE_KINDS.map((kind) => (
            <li key={kind} className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <KindDot kind={kind} />
              <span className="capitalize">{kind}</span>
            </li>
          ))}
        </ul>
      </section>
    </CardContent>
  );
}

function ExploreDetail({
  node,
  edges,
  nodesById,
  onSelect,
  onInspectEffects,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  onSelect: (id: string) => void;
  onInspectEffects: () => void;
}) {
  const outgoing = edges.filter((edge) => edge.from === node.id);
  const incoming = edges.filter((edge) => edge.to === node.id);

  return (
    <>
      <ConnectionGroup
        title="Outgoing"
        icon={ArrowUpRight}
        edges={outgoing}
        otherOf={(edge) => edge.to}
        nodesById={nodesById}
        onSelect={onSelect}
      />
      <ConnectionGroup
        title="Incoming"
        icon={ArrowDownLeft}
        edges={incoming}
        otherOf={(edge) => edge.from}
        nodesById={nodesById}
        onSelect={onSelect}
      />
      {outgoing.length === 0 && incoming.length === 0 ? (
        <p className="text-muted-foreground text-xs">No edges to or from this node.</p>
      ) : null}
      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onInspectEffects}>
        <Waypoints className="size-3.5" aria-hidden="true" />
        What does this affect?
      </Button>
    </>
  );
}

function ConnectionGroup({
  title,
  icon: Icon,
  edges,
  otherOf,
  nodesById,
  onSelect,
}: {
  title: string;
  icon: typeof ArrowUpRight;
  edges: GraphEdge[];
  otherOf: (edge: GraphEdge) => string;
  nodesById: Map<string, GraphNode>;
  onSelect: (id: string) => void;
}) {
  if (edges.length === 0) return null;
  const shown = edges.slice(0, CONNECTIONS_CAP);
  return (
    <section aria-label={`${title} connections`} className="space-y-1.5">
      <SectionHeading>
        <span className="inline-flex items-center gap-1">
          <Icon className="size-3" aria-hidden="true" />
          {title} ({edges.length})
        </span>
      </SectionHeading>
      <ul className="-mx-1.5">
        {shown.map((edge) => {
          const otherId = otherOf(edge);
          const other = nodesById.get(otherId);
          return (
            <li key={edge.id}>
              {/* A real control, not inert text (F-090): clicking walks the graph in the panel. */}
              <button
                type="button"
                onClick={() => onSelect(otherId)}
                title={edge.rationale ?? undefined}
                className="hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {other !== undefined ? <KindDot kind={other.kind} /> : null}
                <span className="text-foreground min-w-0 flex-1 truncate font-mono">
                  {keyOf(otherId, nodesById)}
                </span>
                <span className="text-muted-foreground shrink-0 text-[10px]">{edge.kind}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {edges.length > shown.length ? (
        <p className="text-muted-foreground px-1.5 text-[11px]">
          +{edges.length - shown.length} more
        </p>
      ) : null}
    </section>
  );
}

function EffectsDetail({
  effects,
  effectsPending,
  nodesById,
  onSelect,
}: {
  effects: EffectHit[];
  effectsPending: boolean;
  nodesById: Map<string, GraphNode>;
  onSelect: (id: string) => void;
}) {
  const topScore = effects[0]?.score ?? 0;
  return (
    <section aria-label="Ranked dependents" className="space-y-2">
      <SectionHeading>Affected if this changes</SectionHeading>
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
        <ol className="divide-border/60 divide-y">
          {effects.map((hit) => (
            <li key={hit.nodeId} className="space-y-1 py-2 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(hit.nodeId)}
                  className="text-foreground hover:text-primary focus-visible:ring-ring min-w-0 truncate text-left font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {hit.node.key}
                </button>
                <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
                  {hit.distance} hop{hit.distance === 1 ? '' : 's'} · {hit.score.toFixed(2)}
                </span>
              </div>
              {/* The ranking made visible: score relative to the top hit, tokens only. */}
              <div className="bg-primary/15 h-0.5 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{
                    width: `${topScore > 0 ? Math.round((hit.score / topScore) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-muted-foreground truncate font-mono text-[10px]">
                {hit.path.map((id) => keyOf(id, nodesById)).join(' → ')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
