import { Logo } from '@tessera/brand';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteConfig } from '@/lib/site';

/**
 * Shared layout options for the home and docs layouts — the single place nav structure
 * lives. The stock theme switch is replaced by the radial-ripple toggle (ADR-0054)
 * through the `themeSwitch` slot; icon links fill the left side of the sidebar's footer
 * row (the fumadocs pattern: icons left, theme control right). The GitHub icon appears
 * only once NEXT_PUBLIC_GITHUB_URL is set — the repository publishes with F-059, and
 * this chrome never points at a URL that does not exist.
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <Logo aria-label="Tessera documentation" />,
    url: '/',
  },
  slots: {
    themeSwitch: ThemeToggle,
  },
  ...(siteConfig.githubUrl !== undefined ? { githubUrl: siteConfig.githubUrl } : {}),
  links: [
    {
      type: 'main',
      text: 'Documentation',
      url: '/docs',
      active: 'nested-url',
    },
    {
      type: 'icon',
      label: 'Website',
      text: 'Website',
      url: siteConfig.marketingUrl,
      external: true,
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="size-[18px]"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a13.4 13.4 0 0 1 0 18M12 3a13.4 13.4 0 0 0 0 18" />
        </svg>
      ),
    },
  ],
};
