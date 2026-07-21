import { Logo } from '@tessera/brand';
import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteConfig } from '@/lib/site';

/**
 * Layout options (DOCS-DESIGN §3) — the single place nav structure lives.
 *
 * Two chromes, one identity:
 * - HOME: marketing-like navbar — transparent over the hero (background arrives on
 *   scroll), Documentation link, a Dashboard call-to-action, the Website globe, GitHub
 *   (only once NEXT_PUBLIC_GITHUB_URL exists — the repo publishes with F-059, and the
 *   chrome never points at a URL that does not exist), and the ripple theme toggle.
 * - DOCS: the sidebar owns the utility chrome through its custom footer
 *   (components/sidebar-footer.tsx) — so the stock themeSwitch slot is disabled and
 *   icon links stay OUT of the docs link list (fumadocs would render both into its
 *   stock footer pill otherwise).
 *
 * Every URL comes from lib/site.ts (NEXT_PUBLIC_* — documented in .env.example).
 */

const websiteIcon = (
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
);

const githubIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-[18px]">
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
  </svg>
);

/** The docs section link — the one link both chromes share. */
const documentationLink: LinkItemType = {
  type: 'main',
  text: 'Documentation',
  url: '/docs',
  active: 'nested-url',
};

/** Base for both layouts: brand + search; no links (each chrome declares its own). */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <Logo aria-label="Tessera documentation" />,
    url: '/',
  },
};

/** HOME chrome: transparent-at-top nav with the full link set + nav theme toggle. */
export const homeOptions: BaseLayoutProps = {
  ...baseOptions,
  nav: {
    ...baseOptions.nav,
    transparentMode: 'top',
  },
  slots: {
    themeSwitch: ThemeToggle,
  },
  ...(siteConfig.githubUrl !== undefined ? { githubUrl: siteConfig.githubUrl } : {}),
  links: [
    documentationLink,
    {
      type: 'button',
      text: 'Dashboard',
      url: siteConfig.appUrl,
      external: true,
    },
    {
      type: 'icon',
      label: 'Website',
      text: 'Website',
      url: siteConfig.marketingUrl,
      external: true,
      icon: websiteIcon,
    },
  ],
};

/** DOCS chrome: main links only — the sidebar footer owns icons + the theme toggle. */
export const docsOptions: BaseLayoutProps = {
  ...baseOptions,
  slots: {
    themeSwitch: false,
  },
  links: [documentationLink],
};

export { githubIcon, websiteIcon };
