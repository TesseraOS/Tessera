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
