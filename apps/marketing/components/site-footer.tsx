import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';

const COLUMNS = [
  {
    title: 'product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#product', label: 'Differentiators' },
      { href: '/#deploy', label: 'Deployment' },
    ],
  },
  {
    title: 'resources',
    links: [
      { href: siteConfig.docsUrl, label: 'Documentation' },
      { href: '/llms.txt', label: 'llms.txt' },
    ],
  },
  {
    title: 'get started',
    links: [
      { href: siteConfig.appUrl, label: 'Open the dashboard' },
      { href: siteConfig.docsUrl, label: 'Deploy self-hosted' },
    ],
  },
] as const;

/** Site footer (MARKETING-DESIGN §3.10). */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container className="grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo />
          <p className="text-small text-muted-foreground mt-4 max-w-xs">{siteConfig.tagline}.</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="md:col-span-2">
            <h2 className="text-label text-faint-foreground font-mono">{column.title}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-small text-muted-foreground hover:text-foreground rounded-md transition-colors"
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
        <Container className="flex flex-wrap items-center justify-between gap-2 py-6">
          <p className="text-small text-faint-foreground">© 2026 Tessera. All rights reserved.</p>
          <p className="text-label text-faint-foreground font-mono">agent-readable: /llms.txt</p>
        </Container>
      </div>
    </footer>
  );
}
