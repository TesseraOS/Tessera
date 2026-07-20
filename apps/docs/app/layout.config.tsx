import { Logo } from '@tessera/brand';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteConfig } from '@/lib/site';

/**
 * Shared layout options for the home and docs layouts — the single place nav structure
 * lives. The stock theme switch is replaced by the radial-ripple toggle (ADR-0054)
 * through the `themeSwitch` slot, so every placement (nav, sidebar footer) gets it.
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <Logo aria-label="Tessera documentation" />,
    url: '/',
  },
  slots: {
    themeSwitch: ThemeToggle,
  },
  links: [
    {
      type: 'main',
      text: 'Documentation',
      url: '/docs',
      active: 'nested-url',
    },
    {
      type: 'main',
      text: 'Website',
      url: siteConfig.marketingUrl,
      external: true,
    },
  ],
};
