import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { siteConfig } from '@/lib/site';

/** Closing CTA band (MARKETING-DESIGN §3.9): one message, one primary action. */
export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="bg-surface border-t">
      <Container className="flex flex-col items-center py-20 text-center md:py-24">
        <h2 id="cta-title" className="text-title max-w-xl">
          Give your coding agents a memory.
        </h2>
        <p className="text-body text-muted-foreground mt-4 max-w-md">
          Start locally in minutes. Open core — free where your code lives.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href={siteConfig.appUrl} size="lg">
            Start free
          </ButtonLink>
          <ButtonLink href={siteConfig.docsUrl} variant="ghost" size="lg">
            Deploy self-hosted
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
