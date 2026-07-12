import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';

const COLUMNS = [
  {
    title: 'product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/enterprise', label: 'Enterprise' },
      { href: '/#how-it-works', label: 'How it works' },
    ],
  },
  {
    title: 'resources',
    links: [
      { href: siteConfig.docsUrl, label: 'Documentation' },
      { href: '/skills', label: 'Agent skills' },
      { href: '/llms.txt', label: 'llms.txt' },
      { href: '/brand/tessera-brand-canvas.png', label: 'Brand' },
    ],
  },
  {
    title: 'get started',
    links: [
      { href: siteConfig.appUrl, label: 'Dashboard' },
      { href: siteConfig.docsUrl, label: 'Self-host' },
    ],
  },
  {
    title: 'legal',
    links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/cookies', label: 'Cookies' },
      { href: '/legal/imprint', label: 'Imprint' },
    ],
  },
] as const;

/** Site footer (MARKETING-DESIGN §3.11) — the last register of the plate. F-067 adds
 * the legal column; the brand block yields one column so 4 + 4×2 sums inside the
 * 12-col grid. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container className="grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo emberId="ember-footer" />
          <p className="text-small text-muted-foreground mt-4 max-w-xs">{siteConfig.tagline}.</p>
          <p className="font-serif text-lead text-faint-foreground mt-6 max-w-xs italic">
            the fragment that completes the picture
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="md:col-span-2">
            <h2 className="text-label text-faint-foreground">{column.title}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-small text-muted-foreground hover:text-foreground rounded-md transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-6">
          <p className="text-small text-faint-foreground">© 2026 Tessera. All rights reserved.</p>
          <ThemeToggle />
          <p className="text-label text-faint-foreground">agent-readable: /llms.txt</p>
        </Container>
      </div>
    </footer>
  );
}
