import type React from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';

const delay = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as React.CSSProperties;

/**
 * Hero (MARKETING-DESIGN §3.2, ADR-0045): the serif statement over the shader field.
 * The `.hero-veil` (scrim + masked backdrop blur) keeps the statement legible; the h1
 * is the LCP — server-rendered, never animated from invisible, and locked to exactly
 * two nowrap lines (the display clamp is tuned to this sentence pair).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative flex min-h-svh items-center">
      {/* no veil (v4.3): the shader itself keeps a calm pocket under the statement */}
      <Container className="relative z-10 py-28 md:py-32">
        <div className="max-w-3xl">
          <p className="rise-in text-label text-faint-foreground uppercase">
            Open core · MCP-native · self-hostable
          </p>
          <h1 id="hero-title" className="text-display mt-6">
            <span className="block whitespace-nowrap">Your agents forget.</span>
            <span className="block whitespace-nowrap">
              Tessera <em className="text-rose">remembers</em>.
            </span>
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
            Behind this text: a slow-moving abstract color field in the brand palette. One scroll
            below, an illustrative live knowledge graph shows repositories, git history, decisions,
            memory, and docs flowing into the Tessera hub, which serves compiled context to
            connected coding agents. Telemetry shown is simulated demo data.
          </p>
        </div>
      </Container>
    </section>
  );
}
