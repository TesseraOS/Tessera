import type React from 'react';
import { cn } from '@/lib/utils';

/**
 * MosaicField — the Terra Mosaic signature art (BRAND.md §5, MARKETING-DESIGN §3.2):
 * a deterministic (seeded) tessellation with a diagonal seam of light and one gilded
 * tile arriving into its empty seat. Pure SVG + CSS: server-rendered, responsive,
 * ambient drift + the one-shot arrival, all reduced-motion-safe via the global gates.
 * Counts as the band's gold moment and the viewport's one ambient system.
 */

const TILE = 24;
const GAP = 8;

/** Seeded LCG — same field on every render (server/client identical markup). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
}

const vars = (map: Record<string, string>) => map as React.CSSProperties;

interface MosaicFieldProps {
  cols?: number;
  rows?: number;
  seed?: number;
  /** Unique per page instance (SVG gradient id). */
  emberId: string;
  /** Where the seam of light crosses, as a column fraction. */
  seamAt?: number;
  /** Ambient drift on seam tiles (<=1 ambient system per viewport). */
  drift?: boolean;
  /** The traveling crest (ADR-0045 v4.1) — replaces drift as the band's ambient system. */
  wave?: boolean;
  className?: string;
  label?: string;
}

export function MosaicField({
  cols = 20,
  rows = 6,
  seed = 512026,
  emberId,
  seamAt = 0.64,
  drift = true,
  wave = false,
  className,
  label = 'A mosaic of warm tiles with a diagonal seam of light; one gilded tile arrives to complete the picture',
}: MosaicFieldProps) {
  const rand = rng(seed);
  const width = cols * TILE + (cols - 1) * GAP;
  const height = rows * TILE + (rows - 1) * GAP;
  const seamCol = Math.round(cols * seamAt);
  const gildCol = seamCol;
  const gildRow = Math.max(1, Math.round(rows * 0.3));

  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * (TILE + GAP);
      const y = r * (TILE + GAP);
      const seamDist = Math.abs(c + r * 0.85 - (seamCol + gildRow * 0.85));
      const onSeam = seamDist < 2;
      const near = seamDist < 4;
      const roll = rand();
      const driftRoll = rand();

      if (c === gildCol && r === gildRow) {
        tiles.push(
          <rect
            key="seat"
            x={x + 1.5}
            y={y + 1.5}
            width={TILE - 3}
            height={TILE - 3}
            rx={6}
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.3}
            strokeWidth={1.5}
          />,
          <rect
            key="gilded"
            className="tile-arrive"
            style={vars({
              '--arrive-dx': '30px',
              '--arrive-dy': '-34px',
              '--arrive-delay': '350ms',
            })}
            x={x}
            y={y}
            width={TILE}
            height={TILE}
            rx={7}
            fill={`url(#${emberId})`}
          />,
        );
        continue;
      }

      let fill = 'var(--foreground)';
      let opacity = 0.05 + roll * 0.07;
      if (onSeam) {
        opacity = 0.28 + roll * 0.35;
        if (roll > 0.8) fill = 'var(--rose)';
        else if (roll > 0.64) fill = 'var(--clay)';
      } else if (near) {
        opacity = 0.1 + roll * 0.14;
        if (roll > 0.92) fill = 'var(--burgundy)';
      } else if (roll > 0.96) {
        fill = 'var(--burgundy)';
        opacity = 0.45;
      }

      const drifts = !wave && drift && near && driftRoll > 0.55;
      const animClass = wave ? 'tile-wave' : drifts ? 'tile-drift' : undefined;
      const animStyle = wave
        ? vars({
            '--wave-delay': `${(-(c * 0.18 + r * 0.35)).toFixed(2)}s`,
            '--wave-dur': `${(4.8 + driftRoll * 1.8).toFixed(1)}s`,
          })
        : drifts
          ? vars({
              '--drift-dur': `${(9 + driftRoll * 5).toFixed(1)}s`,
              '--drift-delay': `${(-driftRoll * 8).toFixed(1)}s`,
              '--drift-y': `${-(3 + driftRoll * 4).toFixed(1)}px`,
            })
          : undefined;
      tiles.push(
        <rect
          key={`${c}-${r}`}
          className={animClass}
          style={animStyle}
          x={x}
          y={y}
          width={TILE}
          height={TILE}
          rx={7}
          fill={fill}
          fillOpacity={opacity.toFixed(3)}
        />,
      );
    }
  }

  return (
    <div role="img" aria-label={label} className={cn('w-full', className)}>
      <svg
        viewBox={`0 -40 ${width} ${height + 40}`}
        className="block h-auto w-full"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={emberId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--rose)" />
            <stop offset="1" stopColor="var(--gold)" />
          </linearGradient>
        </defs>
        {tiles}
      </svg>
    </div>
  );
}
