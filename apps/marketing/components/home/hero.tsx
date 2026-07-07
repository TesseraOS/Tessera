import type React from 'react';
import { MosaicField } from '@/components/art/mosaic-field';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';

const delay = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as React.CSSProperties;

/**
 * Hero (MARKETING-DESIGN §3.2): serif display statement over the living mosaic — the
 * brand gesture (one gilded tile arriving) as the page's opening emotion. The h1 is the
 * LCP: server-rendered, never animated. Atmosphere + grain give the dusk ground depth.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="grain relative overflow-hidden">
      <div className="atmosphere absolute inset-x-0 top-0 h-2/3" aria-hidden="true" />
      <Container className="relative flex flex-col items-center pt-28 pb-16 text-center md:pt-36 md:pb-20">
        <p className="rise-in text-label text-faint-foreground font-mono uppercase">
          Open core · MCP-native · self-hostable
        </p>
        <h1 id="hero-title" className="text-display mt-8 max-w-4xl">
          Your agents forget.
          <br />
          Tessera <em className="text-rose">remembers</em>.
        </h1>
        <p className="rise-in text-lead text-muted-foreground mt-8 max-w-2xl" style={delay(80)}>
          The context &amp; memory OS for AI coding agents — it ingests your repos and decisions,
          keeps them across sessions, and compiles budgeted, cited context packages over MCP.
        </p>
        <div
          className="rise-in mt-10 flex flex-wrap items-center justify-center gap-3"
          style={delay(160)}
        >
          <ButtonLink href={siteConfig.appUrl} size="lg">
            Start free
          </ButtonLink>
          <ButtonLink href={siteConfig.docsUrl} variant="secondary" size="lg">
            Read the docs
          </ButtonLink>
        </div>
      </Container>

      <div className="rise-in relative" style={delay(240)}>
        <MosaicField
          emberId="ember-hero"
          cols={24}
          rows={6}
          seed={512026}
          seamAt={0.62}
          className="fade-x mx-auto max-w-7xl px-2"
        />
        <Container className="mt-6 pb-16 text-center md:pb-20">
          <p className="text-label text-faint-foreground font-mono">
            fragments considered: 214 · placed: 213 · arriving: 1
          </p>
        </Container>
      </div>
    </section>
  );
}
