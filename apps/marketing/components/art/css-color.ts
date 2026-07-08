/**
 * Token color helpers for the canvas/WebGL art layer (ADR-0045): the engines stay
 * tokens-only by resolving CSS custom properties at runtime and re-resolving when the
 * theme class flips. Tokens are #rrggbb or rgb()/rgba() strings (globals.css §2).
 */

export type Rgb = [number, number, number];

/**
 * Parses #rgb / #rrggbb / rgb() / rgba() into 0..1 RGB; returns null for anything
 * else. The build minifies six-digit hex to the three-digit shorthand where possible,
 * so the shorthand branch is load-bearing.
 */
export function parseCssColor(value: string): Rgb | null {
  const v = value.trim();
  const hex6 = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex6 && hex6[1]) {
    const n = parseInt(hex6[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const hex3 = /^#([0-9a-f]{3})$/i.exec(v);
  if (hex3 && hex3[1]) {
    const s = hex3[1];
    const r = s.charAt(0);
    const g = s.charAt(1);
    const b = s.charAt(2);
    return [parseInt(r + r, 16) / 255, parseInt(g + g, 16) / 255, parseInt(b + b, 16) / 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(v);
  if (rgb && rgb[1] && rgb[2] && rgb[3]) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  }
  return null;
}

/** Reads a custom property off :root (documentElement carries the theme class). */
export function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Reads a token as RGB with an explicit fallback (keeps the canvas robust). */
export function readTokenRgb(name: string, fallback: Rgb): Rgb {
  return parseCssColor(readToken(name)) ?? fallback;
}

/** rgba() string from a parsed token — for canvas gradient stops. */
export function rgba(color: Rgb, alpha: number): string {
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Relative luminance — the art dims itself on light grounds. */
export function luminance(color: Rgb): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}
