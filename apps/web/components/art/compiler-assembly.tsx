import { cn } from '@/lib/utils';

/**
 * CompilerAssembly (DESIGN-SYSTEM §11, ADR-0047) — retrieved fragments drift in from the
 * left and settle into a token-bounded package on the right (the Context Compiler's job).
 * Server SVG, tokens only, CSS drift + flow; still under reduced motion. Decorative.
 */

const FRAGMENTS = [
  { x: 24, y: 40, w: 58, tone: 'var(--chart-1)', delay: '0s' },
  { x: 16, y: 78, w: 46, tone: 'var(--chart-2)', delay: '0.5s' },
  { x: 30, y: 116, w: 62, tone: 'var(--chart-3)', delay: '1s' },
  { x: 20, y: 154, w: 50, tone: 'var(--chart-5)', delay: '1.5s' },
];

const PACKAGE_ROWS = [
  { y: 44, w: 88, tone: 'var(--chart-1)' },
  { y: 72, w: 108, tone: 'var(--chart-2)' },
  { y: 100, w: 74, tone: 'var(--chart-3)' },
  { y: 128, w: 96, tone: 'var(--chart-5)' },
  { y: 156, w: 60, tone: 'var(--mascot-heart)' },
];

export function CompilerAssembly({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 210"
      className={cn('tess-art text-muted-foreground', className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {/* loose fragments */}
      {FRAGMENTS.map((f, i) => (
        <g key={i} className="tess-float" style={{ ['--tess-delay' as string]: f.delay }}>
          <rect x={f.x} y={f.y} width={f.w} height={20} rx={5} fill={f.tone} fillOpacity={0.9} />
          <rect
            x={f.x + 8}
            y={f.y + 7}
            width={f.w - 22}
            height={6}
            rx={3}
            fill="var(--background)"
            fillOpacity={0.4}
          />
        </g>
      ))}

      {/* flow guides into the package */}
      {FRAGMENTS.map((f, i) => (
        <line
          key={`e${i}`}
          x1={f.x + f.w + 4}
          y1={f.y + 10}
          x2={214}
          y2={PACKAGE_ROWS[i]?.y ?? 100}
          stroke="currentColor"
          strokeWidth={1.25}
          strokeOpacity={0.3}
          className="tess-edge"
        />
      ))}

      {/* the assembled, budget-bounded package */}
      <rect
        x={214}
        y={26}
        width={126}
        height={158}
        rx={12}
        stroke="currentColor"
        strokeOpacity={0.45}
        strokeWidth={1.5}
        fill="var(--card)"
        fillOpacity={0.5}
      />
      {PACKAGE_ROWS.map((r, i) => (
        <rect
          key={i}
          x={228}
          y={r.y}
          width={r.w}
          height={14}
          rx={4}
          fill={r.tone}
          className="tess-pulse"
          style={{ ['--tess-delay' as string]: `${i * 0.4}s` }}
        />
      ))}
    </svg>
  );
}
