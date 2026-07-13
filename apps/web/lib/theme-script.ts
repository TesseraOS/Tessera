/**
 * Theme catalog constants + the pre-paint init script (DESIGN-SYSTEM §0.1, ADR-0047).
 *
 * Plain TS (no 'use client') so the server layout can inline the script. The classless
 * :root/.dark tokens ARE Monkai; the attribute exists for the other catalogs and for
 * e2e assertions. Client-side theme state lives in lib/theme.tsx.
 */

export const THEMES = ['monkai', 'amber', 'claude', 'notebook'] as const;
export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = 'monkai';
export const THEME_STORAGE_KEY = 'tessera.theme';

export const THEME_LABELS: Readonly<Record<ThemeName, string>> = {
  monkai: 'Monkai',
  amber: 'Amber',
  claude: 'Claude',
  notebook: 'Notebook',
};

export const THEME_DESCRIPTIONS: Readonly<Record<ThemeName, string>> = {
  monkai: 'Near-black, monochrome (default)',
  amber: 'Bright canvas, amber accent',
  claude: 'Warm paper, terracotta accent',
  notebook: 'Sketchbook neutrals, hand-drawn',
};

/**
 * Representative swatch colors for the theme picker — preview affordances only (the live
 * tokens live in themes.css and can't be scoped to a nested element because they key off
 * :root[data-theme]). `surface` is the theme's canvas, `accent` its signature hue. Keep
 * these visually in step with themes.css; they are not consumed as component tokens.
 */
export const THEME_SWATCHES: Readonly<Record<ThemeName, { surface: string; accent: string }>> = {
  monkai: { surface: '#171717', accent: '#fcfcfc' },
  amber: { surface: '#ffffff', accent: '#f0a91d' },
  claude: { surface: '#f2ede4', accent: '#c06843' },
  notebook: { surface: '#fafafa', accent: '#3f3f3f' },
};

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs before first paint (inlined in <head>) so the persisted theme never flashes the
 * default. Storage failures (private mode, disabled) fall back to the default theme.
 */
export const THEME_INIT_SCRIPT = `(function () {
  var themes = ${JSON.stringify(THEMES)};
  var theme = ${JSON.stringify(DEFAULT_THEME)};
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored && themes.indexOf(stored) !== -1) theme = stored;
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);
})();`;
