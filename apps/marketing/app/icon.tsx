import { ImageResponse } from 'next/og';

/** Favicon generated from the mosaic mark (inline styles — design-lint allowIn). */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

const TILES = [
  { x: 13, y: 13, size: 6.5, opacity: 1 },
  { x: 20.5, y: 13, size: 6.5, opacity: 0.82 },
  { x: 13, y: 20.5, size: 6.5, opacity: 0.82 },
  { x: 6, y: 13.5, size: 5, opacity: 0.5 },
  { x: 13.5, y: 6, size: 5, opacity: 0.5 },
  { x: 21.5, y: 21.5, size: 4, opacity: 0.3 },
  { x: 6.5, y: 6.5, size: 4, opacity: 0.3 },
];

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: '#030303',
        borderRadius: 6,
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
            borderRadius: 1.4,
            background: '#f5f5f5',
            opacity: tile.opacity,
          }}
        />
      ))}
    </div>,
    size,
  );
}
