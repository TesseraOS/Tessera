import { cn } from '@/lib/utils';

/**
 * TimeRiver (DESIGN-SYSTEM §11, ADR-0047) — decisions, lessons, and ingest events flowing
 * along a time axis, newest cresting at the right. Server SVG, tokens only, CSS drift +
 * flow; still under reduced motion. Decorative.
 */

const EVENTS = [
  { x: 44, up: true, tone: 'var(--chart-2)' },
  { x: 96, up: false, tone: 'var(--chart-3)' },
  { x: 150, up: true, tone: 'var(--chart-1)' },
  { x: 204, up: false, tone: 'var(--chart-5)' },
  { x: 262, up: true, tone: 'var(--mascot-heart)' },
];

const AXIS_Y = 96;

export function TimeRiver({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 176"
      className={cn('tess-art text-muted-foreground', className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {/* the river */}
      <path
        d="M 20 96 C 80 84, 120 108, 170 96 C 220 84, 260 108, 300 96"
        stroke="currentColor"
        strokeWidth={2}
        strokeOpacity={0.35}
        className="tess-edge"
        style={{ ['--tess-dur' as string]: '3.4s' }}
      />

      {EVENTS.map((e, i) => {
        const ny = e.up ? AXIS_Y - 34 : AXIS_Y + 34;
        return (
          <g key={i} className="tess-float" style={{ ['--tess-delay' as string]: `${i * 0.45}s` }}>
            <line
              x1={e.x}
              y1={AXIS_Y}
              x2={e.x}
              y2={ny}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeWidth={1.25}
            />
            <circle cx={e.x} cy={AXIS_Y} r={3.5} fill="currentColor" fillOpacity={0.5} />
            <rect
              x={e.x - 9}
              y={ny - 9}
              width={18}
              height={18}
              rx={5}
              fill={e.tone}
              className="tess-pulse"
              style={{ ['--tess-delay' as string]: `${i * 0.4}s` }}
            />
          </g>
        );
      })}
    </svg>
  );
}
