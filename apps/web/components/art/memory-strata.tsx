import { cn } from '@/lib/utils';

/**
 * MemoryStrata (DESIGN-SYSTEM §11, ADR-0047) — memory as immutable, superseding layers:
 * older versions settle below, the current version rests on top (gilded). Server SVG,
 * tokens only, gentle CSS drift; still under reduced motion. Decorative.
 */

const LAYERS = [
  { y: 132, w: 150, tone: 'var(--muted-foreground)', op: 0.35 },
  { y: 108, w: 168, tone: 'var(--muted-foreground)', op: 0.5 },
  { y: 84, w: 158, tone: 'var(--chart-3)', op: 0.7 },
  { y: 60, w: 176, tone: 'var(--chart-2)', op: 0.85 },
];

export function MemoryStrata({ className }: { className?: string }) {
  const cx = 150;
  return (
    <svg
      viewBox="0 0 300 180"
      className={cn('tess-art text-muted-foreground', className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {/* supersede spine */}
      <line
        x1={cx}
        y1={40}
        x2={cx}
        y2={150}
        stroke="currentColor"
        strokeWidth={1.25}
        strokeOpacity={0.3}
        strokeDasharray="3 5"
      />

      {LAYERS.map((l, i) => (
        <g
          key={i}
          className="tess-float-slow"
          style={{
            ['--tess-delay' as string]: `${i * 0.6}s`,
            ['--tess-dur' as string]: `${6 + i}s`,
          }}
        >
          <rect
            x={cx - l.w / 2}
            y={l.y}
            width={l.w}
            height={18}
            rx={6}
            fill={l.tone}
            fillOpacity={l.op}
          />
          <rect
            x={cx - l.w / 2 + 10}
            y={l.y + 6}
            width={l.w * 0.4}
            height={6}
            rx={3}
            fill="var(--background)"
            fillOpacity={0.4}
          />
        </g>
      ))}

      {/* current version — gilded, on top */}
      <g className="tess-node">
        <rect
          x={cx - 96}
          y={34}
          width={192}
          height={20}
          rx={7}
          fill="var(--card)"
          stroke="var(--mascot-heart)"
          strokeWidth={1.5}
        />
        <circle cx={cx - 82} cy={44} r={4} fill="var(--mascot-heart)" />
        <rect
          x={cx - 70}
          y={41}
          width={104}
          height={6}
          rx={3}
          fill="currentColor"
          fillOpacity={0.5}
        />
      </g>
    </svg>
  );
}
