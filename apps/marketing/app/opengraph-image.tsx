import { ImageResponse } from 'next/og';

/**
 * OG image (1200x630) generated from the design tokens — mosaic mark + wordmark + tagline.
 * ImageResponse requires inline styles; this file is a deliberate design-lint exception
 * (see marketing-design.manifest.json allowIn).
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Tessera — the context & memory OS for AI coding agents';

const TILES = [
  // assembled core
  { x: 0, y: 84, size: 78, opacity: 1 },
  { x: 90, y: 84, size: 78, opacity: 0.82 },
  { x: 0, y: 174, size: 78, opacity: 0.82 },
  // converging fragments
  { x: -84, y: 90, size: 60, opacity: 0.5 },
  { x: 6, y: 0, size: 60, opacity: 0.5 },
  { x: 102, y: 186, size: 48, opacity: 0.3 },
  { x: -78, y: 6, size: 48, opacity: 0.3 },
];

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#030303',
        padding: 72,
      }}
    >
      <div style={{ display: 'flex', position: 'relative', width: 260, height: 260 }}>
        {TILES.map((tile, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: 120 + tile.x,
              top: tile.y,
              width: tile.size,
              height: tile.size,
              borderRadius: 14,
              background: index === 0 ? '#34d399' : '#f5f5f5',
              opacity: tile.opacity,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ color: '#f5f5f5', fontSize: 84, fontWeight: 600, letterSpacing: -3 }}>
          Tessera
        </div>
        <div style={{ color: '#a1a1a1', fontSize: 34, marginTop: 12 }}>
          The context &amp; memory OS for AI coding agents
        </div>
      </div>
    </div>,
    size,
  );
}
