import { cn } from '@/lib/utils';

/**
 * LedgerGate (DESIGN-SYSTEM §11, ADR-0047) — the append-only audit ledger: entries pass a
 * gate, are stamped, and lock into an immutable stack. Server SVG, tokens only, CSS flow;
 * still under reduced motion. Decorative (the empty-state text carries the meaning).
 */

const ROWS = [
  { y: 40, w: 96 },
  { y: 66, w: 118 },
  { y: 92, w: 82 },
  { y: 118, w: 108 },
];

const GATE_X = 176;

export function LedgerGate({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 176"
      className={cn('tess-art text-muted-foreground', className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {/* the gate */}
      <line
        x1={GATE_X}
        y1={20}
        x2={GATE_X}
        y2={156}
        stroke="currentColor"
        strokeOpacity={0.4}
        strokeWidth={1.5}
        strokeDasharray="4 5"
      />
      <circle
        cx={GATE_X}
        cy={88}
        r={13}
        fill="var(--card)"
        stroke="var(--mascot-heart)"
        strokeWidth={1.5}
        className="tess-node"
      />
      <path
        d={`M ${GATE_X - 5} 88 l 3.5 3.5 L ${GATE_X + 6} 84`}
        stroke="var(--mascot-heart)"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* incoming entries */}
      {ROWS.map((r, i) => (
        <g key={i} className="tess-float" style={{ ['--tess-delay' as string]: `${i * 0.5}s` }}>
          <rect
            x={24}
            y={r.y}
            width={r.w}
            height={16}
            rx={5}
            fill="var(--chart-2)"
            fillOpacity={0.75}
          />
          <rect
            x={30}
            y={r.y + 5}
            width={r.w * 0.5}
            height={5}
            rx={2.5}
            fill="var(--background)"
            fillOpacity={0.45}
          />
        </g>
      ))}

      {/* locked, stamped ledger on the far side */}
      {ROWS.map((r, i) => (
        <g
          key={`l${i}`}
          className="tess-pulse"
          style={{ ['--tess-delay' as string]: `${i * 0.4}s` }}
        >
          <rect
            x={210}
            y={r.y}
            width={86}
            height={16}
            rx={5}
            fill="var(--card)"
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
          <circle cx={220} cy={r.y + 8} r={3} fill="var(--chart-1)" />
          <rect
            x={230}
            y={r.y + 5}
            width={52}
            height={5}
            rx={2.5}
            fill="currentColor"
            fillOpacity={0.4}
          />
        </g>
      ))}
    </svg>
  );
}
