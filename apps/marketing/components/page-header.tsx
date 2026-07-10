import type React from 'react';
import { Container } from '@/components/ui/container';

const delay = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as React.CSSProperties;

interface PageHeaderProps {
  /** Label-voice eyebrow above the statement (e.g. the page's register: "pricing"). */
  eyebrow: string;
  /** The page h1 — serif via the base layer, `title` token (display stays hero-only). */
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Optional CTA row / badges rendered under the lead. */
  children?: React.ReactNode;
}

/**
 * Subpage opening (MARKETING-DESIGN §3.12, ADR-0045 v4.4): eyebrow · serif title-token
 * h1 · lead, over atmosphere + grain. The shader field and constellation are
 * homepage-only devices — subpages open quiet. The h1 is the LCP: server-rendered,
 * never animated from invisible (§1.4 spirit); eyebrow/lead/children rise in.
 */
export function PageHeader({ eyebrow, title, lead, children }: PageHeaderProps) {
  return (
    <section aria-labelledby="page-title" className="grain relative overflow-hidden border-b">
      <div className="atmosphere absolute inset-x-0 top-0 h-full" aria-hidden="true" />
      <Container className="relative pt-36 pb-16 md:pt-44 md:pb-20">
        <div className="max-w-3xl">
          <p className="rise-in text-label text-faint-foreground uppercase">{eyebrow}</p>
          <h1 id="page-title" className="text-title text-foreground mt-5">
            {title}
          </h1>
          {lead ? (
            <p className="rise-in text-lead text-muted-foreground mt-6 max-w-2xl" style={delay(80)}>
              {lead}
            </p>
          ) : null}
          {children ? (
            <div className="rise-in mt-8 flex flex-wrap items-center gap-3" style={delay(160)}>
              {children}
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
