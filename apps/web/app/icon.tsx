import { ImageResponse } from 'next/og';

/**
 * Favicon — the v2 mark (BRAND.md §4). The dashboard shipped **no** favicon at all until F-083, so a
 * browser tab showed Next's default globe next to a product with a brand.
 *
 * Identical to `apps/marketing/app/icon.tsx`, deliberately: one brand, one favicon. A user with the
 * marketing site and the dashboard open in adjacent tabs must see the same mark.
 *
 * **Why this restates the geometry instead of importing `@tessera/brand`** — the one sanctioned
 * exception to this feature's whole point. This renders through Satori (`next/og`), not React DOM:
 * Satori does not rasterize `<linearGradient>`/SVG the way a browser does, so the mark is rebuilt
 * from positioned divs with a CSS gradient. It cannot consume the shared component. The shared
 * package remains the source of truth for the mark; if the geometry ever changes, this and its
 * marketing twin change with it.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** The 3×3 mosaic, graded — the master's tiles at 32px scale. */
const TILES = [
  { x: 4, y: 4, size: 6.5, opacity: 0.55 },
  { x: 12.5, y: 4, size: 6.5, opacity: 0.8 },
  { x: 4, y: 12.5, size: 6.5, opacity: 0.8 },
  { x: 12.5, y: 12.5, size: 6.5, opacity: 1 },
  { x: 21, y: 12.5, size: 6.5, opacity: 0.9 },
  { x: 4, y: 21, size: 6.5, opacity: 0.45 },
  { x: 12.5, y: 21, size: 6.5, opacity: 0.9 },
  { x: 21, y: 21, size: 6.5, opacity: 0.7 },
];

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: '#161013',
        borderRadius: 7,
      }}
    >
      {TILES.map((tile, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: tile.x,
            top: tile.y,
            width: tile.size,
            height: tile.size,
            borderRadius: 1.6,
            background: '#F4EDE7',
            opacity: tile.opacity,
          }}
        />
      ))}
      {/* The gilded tile, forever arriving. */}
      <div
        style={{
          position: 'absolute',
          left: 23.5,
          top: 1.5,
          width: 7,
          height: 7,
          borderRadius: 1.8,
          background: 'linear-gradient(120deg, #E2A3A8, #E4B65A)',
        }}
      />
    </div>,
    size,
  );
}
