import { cn } from '@/lib/utils';

/**
 * SignalField (DESIGN-SYSTEM §11, ADR-0047) — the five retrieval signals (semantic /
 * keyword / graph / symbolic / temporal) fanning in from the left and fusing into one
 * ranked result on the right. Colors match the SignalBadge --chart-* mapping. Server SVG,
 * tokens only, CSS flow; still under reduced motion. Decorative.
 */

const SIGNALS = [
  { y: 26, tone: 'var(--chart-1)' }, // semantic
  { y: 66, tone: 'var(--chart-2)' }, // keyword
  { y: 106, tone: 'var(--chart-3)' }, // graph
  { y: 146, tone: 'var(--chart-4)' }, // symbolic
  { y: 186, tone: 'var(--chart-5)' }, // temporal
];

const FUSE_X = 250;
const FUSE_Y = 106;

export function SignalField({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 212"
      className={cn('tess-art text-muted-foreground', className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {SIGNALS.map((s, i) => {
        const d = `M 40 ${s.y} C 150 ${s.y}, 170 ${FUSE_Y}, ${FUSE_X} ${FUSE_Y}`;
        return (
          <g key={i}>
            <path
              d={d}
              stroke={s.tone}
              strokeWidth={1.75}
              strokeOpacity={0.5}
              className="tess-edge"
              style={{ ['--tess-dur' as string]: `${2 + i * 0.3}s` }}
            />
            <rect
              x={24}
              y={s.y - 8}
              width={16}
              height={16}
              rx={4}
              fill={s.tone}
              className="tess-float"
              style={{ ['--tess-delay' as string]: `${i * 0.35}s` }}
            />
            <circle
              r={3.5}
              fill={s.tone}
              className="tess-packet"
              style={{
                ['--tess-path' as string]: `path('${d}')`,
                ['--tess-delay' as string]: `${i * 0.5}s`,
                ['--tess-dur' as string]: '3.4s',
              }}
            />
          </g>
        );
      })}

      {/* fused ranked result */}
      <circle
        cx={FUSE_X}
        cy={FUSE_Y}
        r={20}
        fill="var(--card)"
        stroke="currentColor"
        strokeOpacity={0.4}
        strokeWidth={1.5}
      />
      <circle cx={FUSE_X} cy={FUSE_Y} r={9} fill="var(--mascot-heart)" className="tess-node" />
      {[0, 1, 2].map((r) => (
        <rect
          key={r}
          x={FUSE_X + 34}
          y={FUSE_Y - 20 + r * 16}
          width={r === 0 ? 54 : 42 - r * 6}
          height={9}
          rx={3}
          fill="currentColor"
          fillOpacity={0.3 + (2 - r) * 0.12}
          className="tess-pulse"
          style={{ ['--tess-delay' as string]: `${r * 0.4}s` }}
        />
      ))}
    </svg>
  );
}
