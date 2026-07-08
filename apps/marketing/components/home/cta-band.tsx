import { MosaicField } from '@/components/art/mosaic-field';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';
import { Reveal } from '@/lib/motion';

/**
 * Closing CTA (MARKETING-DESIGN §3.10): back to full dusk — atmosphere, a quiet mosaic
 * strip with its own arriving tile (this band's gold moment), one serif statement, one
 * primary action.
 */
export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="grain relative overflow-hidden border-t">
      <div className="atmosphere absolute inset-x-0 top-0 h-full" aria-hidden="true" />
      <Container className="relative flex flex-col items-center pt-20 pb-10 text-center md:pt-28">
        <Reveal>
          <h2 id="cta-title" className="text-title max-w-2xl">
            Give your agents a memory <em className="text-rose">that lasts</em>.
          </h2>
          <p className="text-body text-muted-foreground mx-auto mt-5 max-w-md">
            Start locally in minutes. Open core — free where your code lives.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href={siteConfig.appUrl} size="lg">
              Start free
            </ButtonLink>
            <ButtonLink href={siteConfig.docsUrl} variant="ghost" size="lg">
              Self-host
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
      <MosaicField
        emberId="ember-cta"
        cols={26}
        rows={3}
        seed={70726}
        seamAt={0.5}
        className="fade-x tile-hover relative mx-auto mt-10 max-w-6xl px-2 pb-14"
        label="A quiet strip of mosaic tiles, drifting, with one gilded tile arriving; tiles light up under the pointer"
      />
    </section>
  );
}
