import { cn } from '@/lib/utils';

/**
 * PipelineFlow (DESIGN-SYSTEM §11, ADR-0047) — a source connects, documents stream through
 * ingest → index, and settle as tesserae in the graph. Server SVG, tokens only, CSS flow;
 * still under reduced motion. Decorative (the empty-state text carries the meaning).
 */

const STAGES = [
  { x: 40, label: 'source', tone: 'var(--chart-3)' },
  { x: 150, label: 'ingest', tone: 'var(--chart-2)' },
  { x: 260, label: 'index', tone: 'var(--chart-1)' },
];

const Y = 70;

export function PipelineFlow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 150"
      className={cn('tess-art text-muted-foreground', className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {/* rail */}
      <line
        x1={40}
        y1={Y}
        x2={300}
        y2={Y}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeOpacity={0.35}
        className="tess-edge"
        style={{ ['--tess-dur' as string]: '3s' }}
      />

      {/* traveling documents */}
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={-6}
          y={-6}
          width={12}
          height={12}
          rx={3}
          fill="var(--mascot-heart)"
          className="tess-packet"
          style={{
            ['--tess-path' as string]: `path('M 40 ${Y} L 300 ${Y}')`,
            ['--tess-delay' as string]: `${i * 1.3}s`,
            ['--tess-dur' as string]: '4s',
          }}
        />
      ))}

      {STAGES.map((s, i) => (
        <g
          key={s.label}
          className="tess-float"
          style={{ ['--tess-delay' as string]: `${i * 0.5}s` }}
        >
          <rect x={s.x - 18} y={Y - 18} width={36} height={36} rx={9} fill={s.tone} />
          <rect
            x={s.x - 8}
            y={Y - 4}
            width={16}
            height={3}
            rx={1.5}
            fill="var(--background)"
            fillOpacity={0.5}
          />
          <rect
            x={s.x - 8}
            y={Y + 2}
            width={10}
            height={3}
            rx={1.5}
            fill="var(--background)"
            fillOpacity={0.5}
          />
        </g>
      ))}

      {/* indexed tesserae settling into the graph */}
      {[
        { x: 288, y: 118 },
        { x: 306, y: 108 },
        { x: 272, y: 110 },
        { x: 300, y: 126 },
      ].map((t, i) => (
        <rect
          key={i}
          x={t.x}
          y={t.y}
          width={11}
          height={11}
          rx={3}
          fill="var(--chart-1)"
          className="tess-pulse"
          style={{ ['--tess-delay' as string]: `${i * 0.5}s` }}
          fillOpacity={0.8}
        />
      ))}
    </svg>
  );
}
