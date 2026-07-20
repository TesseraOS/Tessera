/**
 * The docs-home signature art (DOCS-DESIGN §5): a loose mosaic breathing at field rate,
 * with one tile endlessly arriving into its gap — the brand's recurring gesture told
 * with rose/clay/burgundy only. No gold: on this viewport the gilded moment belongs to
 * Tess's heart. Server-rendered, token-driven, CSS-only motion (frozen under
 * prefers-reduced-motion by the global kill-switch), aria-hidden — the hero text beside
 * it carries all information.
 */

interface Tile {
  x: number;
  y: number;
  size: number;
  fill: string;
  opacity: number;
  phase?: 'b' | 'c';
}

const TILES: Tile[] = [
  { x: 12, y: 24, size: 34, fill: 'var(--burgundy)', opacity: 0.5 },
  { x: 56, y: 10, size: 26, fill: 'var(--clay)', opacity: 0.35, phase: 'b' },
  { x: 96, y: 42, size: 40, fill: 'var(--rose)', opacity: 0.3, phase: 'c' },
  { x: 30, y: 72, size: 28, fill: 'var(--rose)', opacity: 0.22, phase: 'b' },
  { x: 148, y: 18, size: 30, fill: 'var(--burgundy)', opacity: 0.45, phase: 'c' },
  { x: 74, y: 96, size: 36, fill: 'var(--clay)', opacity: 0.4 },
  { x: 152, y: 78, size: 26, fill: 'var(--rose)', opacity: 0.28, phase: 'b' },
  { x: 118, y: 118, size: 30, fill: 'var(--burgundy)', opacity: 0.38, phase: 'c' },
  { x: 22, y: 128, size: 22, fill: 'var(--clay)', opacity: 0.3 },
  { x: 190, y: 52, size: 34, fill: 'var(--clay)', opacity: 0.32, phase: 'b' },
  { x: 196, y: 112, size: 26, fill: 'var(--burgundy)', opacity: 0.42 },
  { x: 66, y: 150, size: 30, fill: 'var(--rose)', opacity: 0.24, phase: 'c' },
];

export function HomeHeroArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 200"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {TILES.map((tile) => (
        <rect
          key={`${tile.x}-${tile.y}`}
          className="tile-drift"
          data-phase={tile.phase}
          x={tile.x}
          y={tile.y}
          width={tile.size}
          height={tile.size}
          rx={tile.size * 0.28}
          fill={tile.fill}
          opacity={tile.opacity}
        />
      ))}
      {/* the gap the arriving tile belongs to — a hairline seat */}
      <rect
        x={148}
        y={148}
        width={30}
        height={30}
        rx={8.4}
        stroke="var(--border-strong)"
        strokeDasharray="4 4"
      />
      {/* the arriving tile — rose, seating itself once per cycle */}
      <rect
        className="tile-arrive"
        x={148}
        y={148}
        width={30}
        height={30}
        rx={8.4}
        fill="var(--rose)"
        opacity={0.85}
      />
    </svg>
  );
}
