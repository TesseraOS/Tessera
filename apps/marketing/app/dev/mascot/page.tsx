import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { Container } from '@/components/ui/container';
import { MascotLab } from './mascot-lab';

/**
 * The Tess debugging lab (ADR-0046 v2) — every mood at several sizes, reactive, on both
 * themes (the footer toggle switches them). A sanctioned DEV exception to the mascot
 * usage budget: noindexed, absent from the sitemap, nav, and llms.txt.
 */
export const metadata: Metadata = {
  title: 'Tess lab (dev)',
  description: 'Internal debugging surface for the Tessera mascot — every mood, both themes.',
  robots: { index: false, follow: false },
};

export default function MascotLabPage() {
  return (
    <>
      <SiteNav />
      <main>
        <section aria-labelledby="tess-lab-title" className="pt-28 pb-24 md:pt-36 md:pb-32">
          <Container>
            <p className="text-label text-faint-foreground uppercase">dev — not indexed</p>
            <h1 id="tess-lab-title" className="text-title text-foreground mt-4 text-balance">
              The Tess lab
            </h1>
            <p className="text-lead text-muted-foreground mt-6 max-w-xl text-pretty">
              Every mood of the mascot, at debugging sizes. Hover for the gaze and perk, click for
              the delight reaction; use the footer toggle to check both themes.
            </p>
            <MascotLab />
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
