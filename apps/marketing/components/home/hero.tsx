import type React from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';
import { CompilePanel } from './compile-panel';

const delay = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as React.CSSProperties;

/**
 * Homepage hero (MARKETING-DESIGN §3.2): eyebrow → h1 → subhead → CTA row → signature
 * visual. The h1 is the LCP — server-rendered, never animated (§1.4). Monochrome
 * hierarchy: problem muted, answer foreground; the accent budget is spent in the panel.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pt-24 pb-20 md:pt-32 md:pb-24">
      <Container className="flex flex-col items-center text-center">
        <p className="text-label text-faint-foreground font-mono uppercase">
          Open core · MCP-native · self-hostable
        </p>
        <h1 id="hero-title" className="text-display mt-6 max-w-3xl">
          <span className="text-muted-foreground">Your agents forget.</span>{' '}
          <span className="text-foreground">Tessera doesn&apos;t.</span>
        </h1>
        <p className="text-lead text-muted-foreground mt-6 max-w-2xl">
          The context &amp; memory OS for AI coding agents. Tessera ingests your repos and
          decisions, remembers them across sessions, and compiles budgeted, cited context packages —
          served to any agent over MCP.
        </p>
        <div
          className="rise-in mt-10 flex flex-wrap items-center justify-center gap-3"
          style={delay(40)}
        >
          <ButtonLink href={siteConfig.appUrl} size="lg">
            Start free
          </ButtonLink>
          <ButtonLink href={siteConfig.docsUrl} variant="secondary" size="lg">
            Read the docs
          </ButtonLink>
        </div>
        <CompilePanel className="rise-in mt-16 w-full max-w-4xl" />
      </Container>
    </section>
  );
}
