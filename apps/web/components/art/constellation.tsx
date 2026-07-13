import { cn } from '@/lib/utils';

/**
 * Constellation (DESIGN-SYSTEM §11, ADR-0047) — the knowledge graph as brand art: tesserae
 * nodes (files/symbols/memories) linked by effect edges, with a few packets tracing the
 * live paths. Server-rendered SVG, dashboard tokens only, CSS-only drift/flow (frozen to a
 * still scene under reduced motion). Decorative — aria-hidden; text carries the meaning.
 */

interface Node {
  id: string;
  x: number;
  y: number;
  r: number;
  tone: string;
  kind: 'hub' | 'node' | 'leaf';
}

const NODES: Node[] = [
  { id: 'hub', x: 240, y: 130, r: 16, tone: 'var(--chart-1)', kind: 'hub' },
  { id: 'a', x: 132, y: 74, r: 11, tone: 'var(--chart-2)', kind: 'node' },
  { id: 'b', x: 128, y: 190, r: 11, tone: 'var(--chart-3)', kind: 'node' },
  { id: 'c', x: 356, y: 70, r: 11, tone: 'var(--chart-4)', kind: 'node' },
  { id: 'd', x: 366, y: 188, r: 11, tone: 'var(--chart-5)', kind: 'node' },
  { id: 'a1', x: 54, y: 40, r: 7, tone: 'var(--muted-foreground)', kind: 'leaf' },
  { id: 'a2', x: 46, y: 120, r: 7, tone: 'var(--muted-foreground)', kind: 'leaf' },
  { id: 'b1', x: 60, y: 230, r: 7, tone: 'var(--muted-foreground)', kind: 'leaf' },
  { id: 'c1', x: 430, y: 34, r: 7, tone: 'var(--muted-foreground)', kind: 'leaf' },
  { id: 'c2', x: 442, y: 112, r: 7, tone: 'var(--muted-foreground)', kind: 'leaf' },
  { id: 'd1', x: 436, y: 232, r: 7, tone: 'var(--muted-foreground)', kind: 'leaf' },
];

const byId = (id: string) => NODES.find((n) => n.id === id)!;

const EDGES: Array<[string, string]> = [
  ['hub', 'a'],
  ['hub', 'b'],
  ['hub', 'c'],
  ['hub', 'd'],
  ['a', 'a1'],
  ['a', 'a2'],
  ['b', 'b1'],
  ['c', 'c1'],
  ['c', 'c2'],
  ['d', 'd1'],
];

/** Packets ride these hub→node edges. */
const PACKETS: Array<{ from: string; to: string; delay: string; dur: string }> = [
  { from: 'hub', to: 'a', delay: '0s', dur: '3.8s' },
  { from: 'hub', to: 'c', delay: '1.2s', dur: '4.2s' },
  { from: 'hub', to: 'd', delay: '2.4s', dur: '3.4s' },
];

function tile(node: Node, index: number) {
  const d = node.r * 2;
  return (
    <rect
      key={node.id}
      x={node.x - node.r}
      y={node.y - node.r}
      width={d}
      height={d}
      rx={Math.max(3, node.r * 0.4)}
      fill={node.tone}
      className={
        node.kind === 'hub' ? 'tess-node' : node.kind === 'node' ? 'tess-float' : 'tess-pulse'
      }
      style={{ ['--tess-delay' as string]: `${(index % 6) * 0.4}s` }}
      fillOpacity={node.kind === 'leaf' ? 0.55 : 1}
    />
  );
}

export function Constellation({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 260"
      className={cn('tess-art text-muted-foreground', className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {EDGES.map(([from, to]) => {
        const a = byId(from);
        const b = byId(to);
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="currentColor"
            strokeWidth={1.25}
            strokeOpacity={0.35}
            className="tess-edge"
            style={{ ['--tess-dur' as string]: '2.8s' }}
          />
        );
      })}

      {PACKETS.map(({ from, to, delay, dur }, i) => {
        const a = byId(from);
        const b = byId(to);
        return (
          <circle
            key={i}
            r={3}
            fill={byId(to).tone}
            className="tess-packet"
            style={{
              ['--tess-path' as string]: `path('M ${a.x} ${a.y} L ${b.x} ${b.y}')`,
              ['--tess-delay' as string]: delay,
              ['--tess-dur' as string]: dur,
            }}
          />
        );
      })}

      {NODES.map((node, i) => tile(node, i))}

      {/* Gilded core glint — the one warm moment. */}
      <circle cx={240} cy={130} r={5} fill="var(--mascot-heart)" className="tess-node" />
    </svg>
  );
}
