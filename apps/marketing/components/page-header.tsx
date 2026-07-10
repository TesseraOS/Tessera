import type React from 'react';
import { ShaderFieldLazy } from '@/components/home/shader-field-lazy';
import { Container } from '@/components/ui/container';
import { cn } from '@/lib/utils';

const delay = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as React.CSSProperties;

interface PageHeaderProps {
  /** Label-voice eyebrow above the statement (e.g. the page's register: "pricing"). */
  eyebrow: string;
  /** The page h1 — serif via the base layer, `title` token (display stays hero-only). */
  title: React.ReactNode;
  lead?: React.ReactNode;
  /**
   * The page's signature art (§3.12) — rendered in the hero's right column on desktop,
   * below the statement on mobile. Already labeled (`role="img"`) by the art itself.
   */
  art?: React.ReactNode;
  /** Optional CTA row / badges rendered under the lead. */
  children?: React.ReactNode;
}

/**
 * Subpage hero (MARKETING-DESIGN §3.12, ADR-0045 v4.5): a full-height statement over
 * the SAME shader-field ground as the homepage — atmosphere fallback below, lazy WebGL
 * field, grain, all dissolving open at the foot (`.fade-bottom`, no hard seam). The h1
 * is the LCP: server-rendered, never animated from invisible; eyebrow/lead/children
 * rise in. The calm pocket in the shader sits under the left-column statement.
 */
export function PageHeader({ eyebrow, title, lead, art, children }: PageHeaderProps) {
  return (
    <section
      aria-labelledby="page-title"
      className="relative flex min-h-svh items-center overflow-hidden"
    >
      <div className="fade-bottom absolute inset-0" aria-hidden="true">
        <div className="atmosphere absolute inset-x-0 top-0 h-2/3" />
        <div className="absolute inset-0">
          <ShaderFieldLazy />
        </div>
        <div className="grain pointer-events-none absolute inset-0" />
      </div>
      <Container className="relative z-10 py-28 md:py-32">
        <div
          className={cn('grid items-center gap-12 md:gap-10', art ? 'md:grid-cols-12' : undefined)}
        >
          <div className={cn('max-w-3xl', art && 'md:col-span-6')}>
            <p className="rise-in text-label text-faint-foreground uppercase">{eyebrow}</p>
            <h1 id="page-title" className="text-title text-foreground mt-5">
              {title}
            </h1>
            {lead ? (
              <p
                className="rise-in text-lead text-muted-foreground mt-6 max-w-xl"
                style={delay(80)}
              >
                {lead}
              </p>
            ) : null}
            {children ? (
              <div className="rise-in mt-8 flex flex-wrap items-center gap-3" style={delay(160)}>
                {children}
              </div>
            ) : null}
          </div>
          {art ? (
            <div className="rise-in md:col-span-6" style={delay(200)}>
              {art}
            </div>
          ) : null}
        </div>
        <p className="sr-only">
          Behind this text: a slow-moving abstract color field in the brand palette, shared with the
          homepage. Any motion shown on this page is decorative and freezes when reduced motion is
          requested.
        </p>
      </Container>
    </section>
  );
}
