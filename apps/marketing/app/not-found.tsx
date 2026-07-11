import type { Metadata } from 'next';
import { Mascot } from '@tessera/mascot';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { TextLink } from '@/components/ui/text-link';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page is not part of the mosaic — head back to the Tessera home.',
};

/**
 * The 404 (MARKETING-DESIGN §3.13, ADR-0046): a quiet full-height statement on the base
 * ground — no shader, no constellation — with Tess in the `lost` mood beside it. The
 * figure's missing tile IS the page's metaphor; its gilded heart is the page's one gold
 * moment. Tess is decorative (the headline carries the information).
 */
export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main>
        <section aria-labelledby="not-found-title" className="flex min-h-svh items-center">
          <Container className="grid items-center gap-12 py-24 md:grid-cols-12 md:gap-8">
            <div className="md:col-span-7">
              <p className="text-label text-faint-foreground uppercase">404 — page not found</p>
              <h1 id="not-found-title" className="text-title text-foreground mt-4 text-balance">
                A tile is <em className="text-rose">missing</em>.
              </h1>
              <p className="text-lead text-muted-foreground mt-6 max-w-xl text-pretty">
                This page is not part of the mosaic — it may have moved, or it has not been placed
                yet.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <ButtonLink href="/">Go home</ButtonLink>
                <TextLink href={siteConfig.docsUrl} className="text-small">
                  Read the docs
                </TextLink>
              </div>
            </div>
            <div className="flex justify-center md:col-span-5 md:justify-end md:pr-8">
              <Mascot mood="lost" size={176} />
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
