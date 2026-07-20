import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * Shared layout options for the home and docs layouts. The docs chrome (Terra Mosaic
 * header, theme ripple) lands with the design foundation; this stays the single place
 * nav/link structure lives.
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: 'Tessera',
  },
};
