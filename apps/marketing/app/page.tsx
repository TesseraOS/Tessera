import type { Metadata } from 'next';
import { CtaBand } from '@/components/home/cta-band';
import { DeployBand } from '@/components/home/deploy-band';
import { Differentiators } from '@/components/home/differentiators';
import { Hero } from '@/components/home/hero';
import { HowItWorks } from '@/components/home/how-it-works';
import { ProofStrip } from '@/components/home/proof-strip';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — context & memory OS for AI coding agents` },
  description: siteConfig.description,
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <ProofStrip />
        <HowItWorks />
        <Differentiators />
        <DeployBand />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
