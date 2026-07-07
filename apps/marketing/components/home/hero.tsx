import type React from 'react';
import { HeroGraph } from '@/components/home/hero-graph';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';

const delay = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as React.CSSProperties;

/**
 * Hero (MARKETING-DESIGN §3.2, ADR-0044): the product alive — a full-bleed interactive
 * knowledge graph breathing behind the serif statement. Text sits over the theme-aware
 * scrim; the h1 is the LCP and never animates from invisible.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="grain relative flex min-h-svh items-center overflow-hidden"
    >
      <div className="atmosphere absolute inset-x-0 top-0 h-2/3" aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 left-0 lg:left-2/5">
        <HeroGraph />
      </div>
      <div className="hero-scrim pointer-events-none absolute inset-0" aria-hidden="true" />

      <Container className="pointer-events-none relative z-10 py-28 md:py-32">
        <div className="pointer-events-auto max-w-2xl">
          <p className="rise-in text-label text-faint-foreground font-mono uppercase">
            Open core · MCP-native · self-hostable
          </p>
          <h1 id="hero-title" className="text-display mt-6">
            Your agents forget.
            <br />
            Tessera <em className="text-rose">remembers</em>.
          </h1>
          <p className="rise-in text-lead text-muted-foreground mt-7 max-w-xl" style={delay(80)}>
            The context &amp; memory OS for AI coding agents — repos, decisions, and lessons
            compiled into budgeted, cited context packages, served over MCP.
          </p>
          <div className="rise-in mt-9 flex flex-wrap items-center gap-3" style={delay(160)}>
            <ButtonLink href={siteConfig.appUrl} size="lg">
              Start free
            </ButtonLink>
            <ButtonLink href={siteConfig.docsUrl} variant="secondary" size="lg">
              Read the docs
            </ButtonLink>
          </div>
          <p className="sr-only">
            Behind this text: an illustrative live knowledge graph — repositories, git history,
            decisions, memory, and docs flowing into the Tessera hub, which serves compiled context
            to connected coding agents. Telemetry shown is simulated demo data.
          </p>
        </div>
      </Container>
    </section>
  );
}
