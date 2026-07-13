import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CONTRAST GATE (WCAG 2.1 AA) — the executable half of DESIGN-SYSTEM §8.1 / ADR-0047,
 * governed by .harness/rules/frontend/contrast.md and the contrast-checker skill.
 *
 * Parses the theme token CSS (globals.css = Monkai, themes.css = the vendored catalog)
 * and asserts every REGISTERED token pairing across all 4 themes × 2 modes:
 *   - text pairs ≥ 4.5:1 (SC 1.4.3)
 *   - non-text UI (focus ring) ≥ 3:1 (SC 1.4.11)
 *
 * If a case fails: FIX THE TOKEN (smallest oklch-lightness nudge that passes, with a CSS
 * comment), never this file's thresholds. New token pairs used as text must be added to
 * the registry in the same change. Zero dependencies: the oklch → linear-sRGB → WCAG
 * luminance math is implemented (and self-tested) below.
 */

/* ────────────────────────── color math (self-tested) ────────────────────────── */

interface Rgba {
  /** linear-light channels 0..1 (not gamma-encoded) */
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** WCAG channel linearization for gamma-encoded sRGB 0..1. */
const linearize = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** Inverse (linear → gamma-encoded sRGB 0..1). */
const delinearize = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function fromHex(hex: string): Rgba {
  const h = hex.slice(1);
  const full = h.length === 3 || h.length === 4 ? [...h].map((ch) => ch + ch).join('') : h;
  const int = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  return {
    r: linearize(int(0)),
    g: linearize(int(2)),
    b: linearize(int(4)),
    alpha: full.length === 8 ? int(6) : 1,
  };
}

function fromRgbFunction(value: string): Rgba {
  const nums = value
    .replace(/rgba?\(/, '')
    .replace(/\)/, '')
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const [r = 0, g = 0, b = 0, alpha = 1] = nums;
  return {
    r: linearize(clamp01(r / 255)),
    g: linearize(clamp01(g / 255)),
    b: linearize(clamp01(b / 255)),
    alpha: clamp01(alpha),
  };
}

/** oklch(L C H [/ A]) → linear sRGB via OKLab → LMS (Björn Ottosson's reference matrices). */
function fromOklch(value: string): Rgba {
  const body = value.replace(/oklch\(/, '').replace(/\)/, '');
  const [main, alphaPart] = body.split('/');
  const parts = main!.trim().split(/\s+/);
  const num = (s: string) => (s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s));
  const L = num(parts[0]!);
  const C = num(parts[1]!);
  const H = parseFloat(parts[2] ?? '0');
  const alpha = alphaPart ? num(alphaPart.trim()) : 1;

  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: clamp01(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: clamp01(alpha),
  };
}

function parseColor(raw: string): Rgba {
  const value = raw.trim();
  if (value.startsWith('#')) return fromHex(value);
  if (value.startsWith('rgb')) return fromRgbFunction(value);
  if (value.startsWith('oklch')) return fromOklch(value);
  throw new Error(`unsupported color syntax: "${value}" — extend the checker`);
}

/** CSS alpha compositing happens on gamma-encoded values; backdrop assumed opaque. */
function compositeOver(fg: Rgba, backdrop: Rgba): Rgba {
  if (fg.alpha >= 1) return fg;
  const blend = (f: number, b: number) => {
    const enc = fg.alpha * delinearize(f) + (1 - fg.alpha) * delinearize(b);
    return linearize(clamp01(enc));
  };
  return {
    r: blend(fg.r, backdrop.r),
    g: blend(fg.g, backdrop.g),
    b: blend(fg.b, backdrop.b),
    alpha: 1,
  };
}

const luminance = (c: Rgba) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

function contrastRatio(fg: Rgba, bg: Rgba): number {
  const back = compositeOver(bg, { r: 1, g: 1, b: 1, alpha: 1 });
  const front = compositeOver(fg, back);
  const l1 = luminance(front);
  const l2 = luminance(back);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ────────────────────────── token CSS parsing ────────────────────────── */

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(join(here, '../app/globals.css'), 'utf8');
const themesCss = readFileSync(join(here, '../app/themes.css'), 'utf8');

/** Extract `--name: value;` declarations from the FIRST top-level block whose selector
 *  line matches exactly. Comments stripped; nested braces respected. */
function blockVars(css: string, selector: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const needle = `${selector} {`;
  const start = clean.indexOf(needle);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  let depth = 0;
  let i = start + needle.length - 1;
  let end = -1;
  for (; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`unbalanced block for: ${selector}`);
  const body = clean.slice(start + needle.length, end);
  const vars = new Map<string, string>();
  for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(match[1]!, match[2]!.trim());
  }
  return vars;
}

const monkaiRoot = blockVars(globalsCss, ':root');
const monkaiDark = blockVars(globalsCss, '.dark');

const THEMES = ['monkai', 'amber', 'claude', 'notebook'] as const;
const MODES = ['light', 'dark'] as const;

/** Cascade-resolved token map for a theme × mode (mirrors the runtime cascade order). */
function resolveTokens(theme: (typeof THEMES)[number], mode: (typeof MODES)[number]) {
  const layers: Array<Map<string, string>> = [monkaiRoot];
  if (mode === 'dark') layers.push(monkaiDark);
  if (theme !== 'monkai') {
    layers.push(blockVars(themesCss, `:root[data-theme='${theme}']`));
    if (mode === 'dark') layers.push(blockVars(themesCss, `:root[data-theme='${theme}'].dark`));
  }
  const merged = new Map<string, string>();
  for (const layer of layers) for (const [k, v] of layer) merged.set(k, v);
  return merged;
}

/* ────────────────────────── the pair registry ────────────────────────── */

/**
 * Every (foreground-token, background-token) rendered as TEXT somewhere in the app.
 * Introducing a new text pairing? Register it here in the same change (contrast rule §6).
 */
const TEXT_PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'muted'], // step chips, kbd surfaces
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'popover'], // dropdown descriptions
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'background'], // destructive-as-text (error rows, badges)
  ['destructive', 'card'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
];

/** Non-text UI that must be perceivable (SC 1.4.11): the focus ring on its surfaces. */
const NON_TEXT_PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ['ring', 'background'],
  ['ring', 'card'],
  ['sidebar-ring', 'sidebar'],
];

/* ────────────────────────── tests ────────────────────────── */

describe('color math (known WCAG values)', () => {
  it('computes canonical luminances', () => {
    expect(luminance(parseColor('#ffffff'))).toBeCloseTo(1, 5);
    expect(luminance(parseColor('#000000'))).toBeCloseTo(0, 5);
    expect(luminance(parseColor('#808080'))).toBeCloseTo(0.2158, 3);
    // sRGB red — via hex and via its oklch equivalent (round-trips the OKLab matrices)
    expect(luminance(parseColor('#ff0000'))).toBeCloseTo(0.2126, 4);
    expect(luminance(parseColor('oklch(0.6280 0.25768 29.234)'))).toBeCloseTo(0.2126, 2);
  });

  it('computes canonical ratios', () => {
    expect(contrastRatio(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 2);
    // #767676 on white is the classic 4.54:1 AA-borderline gray
    expect(contrastRatio(parseColor('#767676'), parseColor('#ffffff'))).toBeCloseTo(4.54, 2);
    // order-independent
    expect(contrastRatio(parseColor('#ffffff'), parseColor('#767676'))).toBeCloseTo(4.54, 2);
  });

  it('composites alpha in gamma space', () => {
    // 50% black over white blends to ENCODED 0.5 gray (Y = linearize(0.5) ≈ 0.2140),
    // giving black-on-it 5.281:1 — a linear-space blend would give 4.95:1 instead.
    const half = contrastRatio(parseColor('rgba(0, 0, 0, 1)'), parseColor('rgba(0, 0, 0, 0.5)'));
    expect(half).toBeCloseTo(5.281, 2);
  });
});

describe.each(THEMES.flatMap((t) => MODES.map((m) => [t, m] as const)))(
  'theme %s · %s mode',
  (theme, mode) => {
    const tokens = resolveTokens(theme, mode);

    const color = (name: string) => {
      const value = tokens.get(name);
      if (!value) throw new Error(`token --${name} missing in ${theme}/${mode}`);
      return parseColor(value);
    };

    it.each(TEXT_PAIRS.map(([fg, bg]) => [fg, bg]))('text --%s on --%s ≥ 4.5:1', (fg, bg) => {
      const ratio = contrastRatio(color(fg), color(bg));
      expect(
        ratio,
        `--${fg} (${tokens.get(fg)}) on --${bg} (${tokens.get(bg)}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });

    it.each(NON_TEXT_PAIRS.map(([fg, bg]) => [fg, bg]))('non-text --%s on --%s ≥ 3:1', (fg, bg) => {
      const ratio = contrastRatio(color(fg), color(bg));
      expect(
        ratio,
        `--${fg} (${tokens.get(fg)}) on --${bg} (${tokens.get(bg)}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    });

    it('defines the full color role set (no leakage from Monkai)', () => {
      if (theme === 'monkai') return;
      const themeOwn = blockVars(themesCss, `:root[data-theme='${theme}']`);
      for (const [fg, bg] of [...TEXT_PAIRS, ...NON_TEXT_PAIRS]) {
        expect(themeOwn.has(fg), `--${fg} must be defined by [data-theme='${theme}']`).toBe(true);
        expect(themeOwn.has(bg), `--${bg} must be defined by [data-theme='${theme}']`).toBe(true);
      }
    });
  },
);
