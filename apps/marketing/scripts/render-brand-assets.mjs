/**
 * Brand asset renderer — deterministic PNG exports of the Tessera logo system and the
 * Terra Mosaic brand canvas (docs/design/BRAND.md §4, philosophy: terra-mosaic-philosophy.md).
 *
 * Usage: node apps/marketing/scripts/render-brand-assets.mjs
 * Outputs to apps/marketing/public/brand/ and docs/design/brand/ (masters).
 * Rendering is Playwright Chromium (already a workspace dependency); the wordmark uses the
 * committed Instrument Serif TTFs so output is reproducible on any machine.
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const REPO = resolve(APP, '..', '..');
const OUT_WEB = join(APP, 'public', 'brand');
const OUT_DOCS = join(REPO, 'docs', 'design', 'brand');
const FONTS = pathToFileURL(join(REPO, 'docs', 'design', 'brand', 'fonts')).href;

const C = {
  dusk: '#161013',
  surface: '#1E1519',
  ivory: '#F4EDE7',
  rose: '#E2A3A8',
  gold: '#E4B65A',
  clay: '#C8836C',
  burgundy: '#5D2E46',
  sand: '#F1E8DF',
  espresso: '#2B1E25',
};

/** Seeded LCG so the brand canvas is identical on every render. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
}

const fontFaces = `
  @font-face { font-family: 'Instrument Serif'; src: url('${FONTS}/InstrumentSerif-Regular.ttf'); font-style: normal; }
  @font-face { font-family: 'Instrument Serif'; src: url('${FONTS}/InstrumentSerif-Italic.ttf'); font-style: italic; }
  @font-face { font-family: 'Instrument Sans'; src: url('${FONTS}/InstrumentSans-Regular.ttf'); font-weight: 400; }
`;

/** The mark as inline SVG. mode: 'dark' (ivory tiles) | 'sand' (espresso tiles). */
function markSvg(size, mode = 'dark') {
  const tile = mode === 'sand' ? C.espresso : C.ivory;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 112 112" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ember" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${C.rose}"/><stop offset="1" stop-color="${C.gold}"/>
      </linearGradient>
    </defs>
    <g fill="${tile}">
      <rect x="14" y="14" width="24" height="24" rx="7" fill-opacity="0.55"/>
      <rect x="44" y="14" width="24" height="24" rx="7" fill-opacity="0.80"/>
      <rect x="14" y="44" width="24" height="24" rx="7" fill-opacity="0.80"/>
      <rect x="44" y="44" width="24" height="24" rx="7"/>
      <rect x="74" y="44" width="24" height="24" rx="7" fill-opacity="0.90"/>
      <rect x="14" y="74" width="24" height="24" rx="7" fill-opacity="0.45"/>
      <rect x="44" y="74" width="24" height="24" rx="7" fill-opacity="0.90"/>
      <rect x="74" y="74" width="24" height="24" rx="7" fill-opacity="0.70"/>
    </g>
    <rect x="75" y="15" width="22" height="22" rx="6.4" fill="none" stroke="${tile}" stroke-opacity="0.28" stroke-width="1.6"/>
    <rect x="83" y="5" width="24" height="24" rx="7" fill="url(#ember)"/>
  </svg>`;
}

function page(bodyStyle, content) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fontFaces}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { ${bodyStyle} }
  </style></head><body>${content}</body></html>`;
}

/** App-icon: mark centered on a rounded dusk (or sand) square. */
function iconHtml(size, ground) {
  const bg = ground === 'sand' ? C.sand : C.dusk;
  const radius = Math.round(size * 0.22);
  return page(
    'background: transparent;',
    `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:${radius}px;
       display:flex;align-items:center;justify-content:center;">
       ${markSvg(Math.round(size * 0.62), ground === 'sand' ? 'sand' : 'dark')}
     </div>`,
  );
}

function markTransparentHtml(size, mode) {
  return page(
    'background: transparent;',
    `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${markSvg(size, mode)}
    </div>`,
  );
}

/** Horizontal lockup: mark + "tessera" in Instrument Serif. */
function lockupHtml(width, height, ground) {
  const dark = ground !== 'transparent-sand' && ground !== 'sand';
  const fg = dark ? C.ivory : C.espresso;
  const bg = ground === 'dark' ? C.dusk : ground === 'sand' ? C.sand : 'transparent';
  const markSize = Math.round(height * 0.72);
  return page(
    `background: ${bg};`,
    `<div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;gap:${Math.round(height * 0.14)}px;">
       ${markSvg(markSize, dark ? 'dark' : 'sand')}
       <span style="font-family:'Instrument Serif',serif;font-size:${Math.round(height * 0.46)}px;color:${fg};letter-spacing:0.01em;transform:translateY(-${Math.round(height * 0.03)}px);">tessera</span>
     </div>`,
  );
}

/** The Terra Mosaic brand canvas — museum plate, deterministic tessellation study. */
function canvasHtml(width, height) {
  const rand = rng(51_2026);
  const cols = 18;
  const rows = 13;
  const gap = 12;
  const margin = 120;
  const fieldW = width - margin * 2;
  const tile = Math.floor((fieldW - gap * (cols - 1)) / cols);
  const fieldH = rows * tile + (rows - 1) * gap;

  // The gilded tile sits at the golden-ratio column on the seam.
  const gildCol = 11;
  const gildRow = 4;

  let tiles = '';
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * (tile + gap);
      const y = r * (tile + gap);
      // A diagonal seam of light running through the quiet field.
      const seamDist = Math.abs(c + r * 0.9 - 14.5);
      const onSeam = seamDist < 2.2;
      const near = seamDist < 4.2;
      const roll = rand();
      let fill = C.ivory;
      let opacity = 0.05 + rand() * 0.08;
      if (onSeam) {
        opacity = 0.3 + rand() * 0.4;
        if (roll > 0.82) fill = C.rose;
        else if (roll > 0.68) fill = C.clay;
      } else if (near) {
        opacity = 0.12 + rand() * 0.16;
        if (roll > 0.93) fill = C.burgundy;
      } else if (roll > 0.965) {
        fill = C.burgundy;
        opacity = 0.5;
      }
      if (c === gildCol && r === gildRow) {
        // the empty seat — its tile is the one arriving above the field
        tiles += `<rect x="${x + 2}" y="${y + 2}" width="${tile - 4}" height="${tile - 4}" rx="10"
          fill="none" stroke="${C.ivory}" stroke-opacity="0.3" stroke-width="2"/>`;
        continue;
      }
      tiles += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="11"
        fill="${fill}" fill-opacity="${opacity.toFixed(3)}"/>`;
    }
  }
  const gx = gildCol * (tile + gap) + tile * 0.42;
  const gy = gildRow * (tile + gap) - tile * 0.52;
  const arriving = `<rect x="${gx}" y="${gy}" width="${tile}" height="${tile}" rx="11" fill="url(#ember)"/>`;

  const ticks = Array.from({ length: cols + 1 })
    .map((_, i) => {
      const x = i * (tile + gap) - gap / 2;
      const major = i % 3 === 0;
      return i === 0 || i === cols
        ? ''
        : `<line x1="${x}" y1="0" x2="${x}" y2="${major ? 14 : 8}" stroke="${C.ivory}" stroke-opacity="${major ? 0.35 : 0.18}" stroke-width="1.5"/>`;
    })
    .join('');

  return page(
    `background: ${C.dusk}; width:${width}px; height:${height}px; position:relative; overflow:hidden;`,
    `
    <svg width="0" height="0"><defs>
      <linearGradient id="ember" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${C.rose}"/><stop offset="1" stop-color="${C.gold}"/>
      </linearGradient>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter>
    </defs></svg>

    <div style="position:absolute;inset:0;opacity:0.05;">
      <svg width="100%" height="100%"><rect width="100%" height="100%" filter="url(#grain)"/></svg>
    </div>

    <div style="position:absolute;left:${margin}px;right:${margin}px;top:104px;display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid rgba(244,237,231,0.16);padding-bottom:20px;">
      <span style="font-family:'Instrument Sans';font-size:19px;letter-spacing:0.24em;color:${C.ivory};opacity:0.75;">TERRA MOSAIC — PLATE I</span>
      <span style="font-family:'Geist Mono','Instrument Sans',monospace;font-size:17px;letter-spacing:0.12em;color:${C.ivory};opacity:0.45;">TESSERA · CONTEXT &amp; MEMORY</span>
    </div>

    <svg style="position:absolute;left:${margin}px;top:210px;" width="${fieldW}" height="${fieldH + 60}" viewBox="0 -60 ${fieldW} ${fieldH + 60}">
      <g transform="translate(0,0)">${tiles}${arriving}</g>
    </svg>

    <svg style="position:absolute;left:${margin}px;top:${210 + fieldH + 84}px;" width="${fieldW}" height="18">${ticks}
      <line x1="0" y1="0" x2="${fieldW}" y2="0" stroke="${C.ivory}" stroke-opacity="0.22" stroke-width="1.5"/>
    </svg>

    <div style="position:absolute;left:${margin}px;top:${210 + fieldH + 122}px;font-family:'Instrument Sans';font-size:17px;letter-spacing:0.1em;color:${C.ivory};opacity:0.5;">
      fragments considered: 214 &nbsp;·&nbsp; placed: 213 &nbsp;·&nbsp; arriving: 1
    </div>

    <div style="position:absolute;left:${margin}px;right:${margin}px;top:${210 + fieldH + 210}px;font-family:'Instrument Serif',serif;font-size:74px;line-height:1.14;color:${C.ivory};">
      the fragment that <span style="font-style:italic;color:${C.rose};">completes</span><br/>the picture
    </div>

    <div style="position:absolute;left:${margin}px;right:${margin}px;bottom:104px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(244,237,231,0.16);padding-top:34px;">
      <div style="display:flex;align-items:center;gap:20px;">
        ${markSvg(56)}
        <span style="font-family:'Instrument Serif',serif;font-size:40px;color:${C.ivory};">tessera</span>
      </div>
      <span style="font-family:'Instrument Sans';font-size:16px;letter-spacing:0.18em;color:${C.ivory};opacity:0.4;">ASSEMBLED BY HAND · MMXXVI</span>
    </div>
    `,
  );
}

const JOBS = [
  {
    name: 'tessera-mark-dark-1024.png',
    w: 1024,
    h: 1024,
    html: iconHtml(1024, 'dark'),
    transparent: true,
  },
  {
    name: 'tessera-mark-dark-512.png',
    w: 512,
    h: 512,
    html: iconHtml(512, 'dark'),
    transparent: true,
  },
  {
    name: 'tessera-mark-sand-1024.png',
    w: 1024,
    h: 1024,
    html: iconHtml(1024, 'sand'),
    transparent: true,
  },
  {
    name: 'tessera-mark-transparent-1024.png',
    w: 1024,
    h: 1024,
    html: markTransparentHtml(1024, 'dark'),
    transparent: true,
  },
  {
    name: 'tessera-lockup-dark-2400x640.png',
    w: 2400,
    h: 640,
    html: lockupHtml(2400, 640, 'dark'),
    transparent: false,
  },
  {
    name: 'tessera-lockup-transparent-2400x640.png',
    w: 2400,
    h: 640,
    html: lockupHtml(2400, 640, 'transparent'),
    transparent: true,
  },
  {
    name: 'tessera-brand-canvas.png',
    w: 1600,
    h: 2000,
    html: canvasHtml(1600, 2000),
    transparent: false,
  },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
mkdirSync(OUT_WEB, { recursive: true });
mkdirSync(OUT_DOCS, { recursive: true });

for (const job of JOBS) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: job.w, height: job.h });
  await p.setContent(job.html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const file = join(OUT_WEB, job.name);
  await p.screenshot({ path: file, omitBackground: job.transparent });
  copyFileSync(file, join(OUT_DOCS, job.name));
  await p.close();
  console.log('rendered', job.name);
}

await browser.close();
console.log('brand assets written to', OUT_WEB, 'and', OUT_DOCS);
