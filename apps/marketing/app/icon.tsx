import { ImageResponse } from 'next/og';

/** Favicon — the v2 mark on the dusk ground (inline styles: design-lint allowIn). */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

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
