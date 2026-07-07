'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#product', label: 'Product' },
  { href: '/#deploy', label: 'Deploy' },
  { href: siteConfig.docsUrl, label: 'Docs' },
] as const;

/**
 * Sticky site nav (MARKETING-DESIGN §3.1) — the one place backdrop-blur is allowed.
 * The mobile disclosure closes on Escape and on link navigation; the toggle keeps focus.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector('a')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="Tessera home" className="rounded-md">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-small text-muted-foreground hover:text-foreground rounded-md transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href={siteConfig.appUrl} variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href={siteConfig.appUrl} size="sm">
            Start free
          </ButtonLink>
        </div>

        <button
          type="button"
          className="text-foreground -mr-2 inline-flex size-10 items-center justify-center rounded-md md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-5"
            aria-hidden="true"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </Container>

      <div
        id="mobile-nav"
        ref={panelRef}
        className={cn('border-t md:hidden', open ? 'block' : 'hidden')}
      >
        <Container className="flex flex-col gap-1 py-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-body text-muted-foreground hover:text-foreground rounded-md py-2 transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-3 flex items-center gap-3 border-t pt-4">
            <ButtonLink href={siteConfig.appUrl} variant="secondary" size="md" className="flex-1">
              Sign in
            </ButtonLink>
            <ButtonLink href={siteConfig.appUrl} size="md" className="flex-1">
              Start free
            </ButtonLink>
          </div>
        </Container>
      </div>
    </header>
  );
}
