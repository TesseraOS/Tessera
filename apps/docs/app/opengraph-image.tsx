import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * OG image (1200x630) — the Terra Mosaic plate in its documentation reading: dusk
 * ground, the mark's tiles with the gilded arrival, serif wordmark + the docs subtitle.
 * Rendered at build with the committed brand font. Inline styles and hex values are
 * unavoidable in ImageResponse (no CSS variables in the OG renderer) — this file is the
 * documented design-lint exception, mirroring marketing's.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Tessera documentation — quickstart, concepts, references, deployment';

const TILES = [
  { x: 0, y: 27, size: 72, opacity: 0.55 },
  { x: 90, y: 27, size: 72, opacity: 0.8 },
  { x: 0, y: 117, size: 72, opacity: 0.8 },
  { x: 90, y: 117, size: 72, opacity: 1 },
  { x: 180, y: 117, size: 72, opacity: 0.9 },
  { x: 0, y: 207, size: 72, opacity: 0.45 },
  { x: 90, y: 207, size: 72, opacity: 0.9 },
  { x: 180, y: 207, size: 72, opacity: 0.7 },
];

export default async function OpengraphImage() {
  const serif = await readFile(
    join(
      process.cwd(),
      '..',
      '..',
      'docs',
      'design',
      'brand',
      'fonts',
      'InstrumentSerif-Regular.ttf',
    ),
  );

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#161013',
        padding: 72,
        fontFamily: 'Instrument Serif',
      }}
    >
      <div style={{ display: 'flex', position: 'relative', width: 300, height: 300 }}>
        {TILES.map((tile, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: tile.x,
              top: tile.y,
              width: tile.size,
              height: tile.size,
              borderRadius: 16,
              background: '#F4EDE7',
              opacity: tile.opacity,
            }}
          />
        ))}
        {/* the empty seat + the gilded arriving tile */}
        <div
          style={{
            position: 'absolute',
            left: 183,
            top: 30,
            width: 66,
            height: 66,
            borderRadius: 14,
            border: '2px solid rgba(244,237,231,0.3)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 207,
            top: 0,
            width: 72,
            height: 72,
            borderRadius: 16,
            background: 'linear-gradient(120deg, #E2A3A8, #E4B65A)',
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ color: '#F4EDE7', fontSize: 110, lineHeight: 1 }}>tessera docs</div>
        <div style={{ color: '#B7A8A8', fontSize: 36, marginTop: 16 }}>
          Quickstart · concepts · guides · agents · reference · deployment
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: 'Instrument Serif', data: serif, weight: 400, style: 'normal' }],
    },
  );
}
