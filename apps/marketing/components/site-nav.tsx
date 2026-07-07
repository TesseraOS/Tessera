'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/#problem', label: 'Why' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#product', label: 'Product' },
  { href: siteConfig.docsUrl, label: 'Docs' },
] as const;

/**
 * Site nav (MARKETING-DESIGN §3.1, ADR-0044): transparent over the hero, gaining the
 * dusk-glass + hairline after ~8px of scroll. Mobile: a full-screen overlay menu with
 * staggered serif links, scroll lock, Escape and focus management.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
      toggle?.focus();
    };
  }, [open]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300',
        scrolled
          ? 'bg-background/85 border-border backdrop-blur'
          : 'border-transparent bg-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="Tessera home" className="rounded-md">
          <Logo emberId="ember-nav" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="link-underline text-small text-muted-foreground hover:text-foreground transition-colors duration-200"
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
          ref={toggleRef}
          type="button"
          className="text-foreground -mr-2 inline-flex size-11 items-center justify-center rounded-md md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
        >
          <span className="sr-only">Open menu</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-5"
            aria-hidden="true"
          >
            <path d="M4 8h16M4 16h16" strokeLinecap="round" />
          </svg>
        </button>
      </Container>

      {/* Full-screen mobile menu (ADR-0044) */}
      {open ? (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="bg-background grain fixed inset-0 z-50 flex flex-col md:hidden"
        >
          <div className="atmosphere absolute inset-x-0 top-0 h-1/2" aria-hidden="true" />
          <Container className="relative flex h-16 shrink-0 items-center justify-between">
            <Logo emberId="ember-menu" />
            <button
              ref={closeRef}
              type="button"
              className="text-foreground -mr-2 inline-flex size-11 items-center justify-center rounded-md"
              onClick={() => setOpen(false)}
            >
              <span className="sr-only">Close menu</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </Container>
          <nav
            aria-label="Menu"
            className="relative flex flex-1 flex-col justify-center gap-1 px-6 md:px-8"
          >
            {NAV_LINKS.map((link, index) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rise-in text-title text-foreground hover:text-rose rounded-md py-2.5 font-serif transition-colors duration-200"
                style={{ '--rise-delay': `${60 + index * 70}ms` } as React.CSSProperties}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Container className="relative flex shrink-0 items-center gap-3 pb-10">
            <ButtonLink
              href={siteConfig.appUrl}
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Sign in
            </ButtonLink>
            <ButtonLink
              href={siteConfig.appUrl}
              size="lg"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Start free
            </ButtonLink>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
