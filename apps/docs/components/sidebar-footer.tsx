import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteConfig } from '@/lib/site';

/**
 * The docs sidebar footer (DOCS-DESIGN §3): a hairline-topped utility row — quiet ghost
 * icon links to the sibling surfaces on the left, the theme toggle on the right. Replaces
 * fumadocs' stock bordered pill (which reads unfinished with few items); the stock row is
 * suppressed by disabling the layout's themeSwitch slot and keeping icon links out of the
 * docs layout's link list. Also rendered inside the mobile drawer by the same `footer`
 * slot, so no placement loses the toggle.
 */

interface FooterLink {
  href: string;
  label: string;
  icon: ReactNode;
}

const ICON_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
} as const;

function footerLinks(): FooterLink[] {
  const links: FooterLink[] = [
    {
      href: siteConfig.marketingUrl,
      label: 'Website',
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="size-[16px]" {...ICON_STROKE}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a13.4 13.4 0 0 1 0 18M12 3a13.4 13.4 0 0 0 0 18" />
        </svg>
      ),
    },
    {
      href: siteConfig.appUrl,
      label: 'Dashboard',
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="size-[16px]" {...ICON_STROKE}>
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
          <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
        </svg>
      ),
    },
  ];
  if (siteConfig.githubUrl !== undefined) {
    links.push({
      href: siteConfig.githubUrl,
      label: 'GitHub',
      icon: (
        <svg aria-hidden viewBox="0 0 24 24" className="size-[16px]" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
        </svg>
      ),
    });
  }
  return links;
}

export function SidebarFooter() {
  return (
    <div className="border-border flex items-center gap-0.5 border-t pt-3">
      {footerLinks().map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={link.label}
          title={link.label}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex size-7 items-center justify-center rounded-md transition-colors duration-200"
        >
          {link.icon}
        </a>
      ))}
      <div className="ms-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
