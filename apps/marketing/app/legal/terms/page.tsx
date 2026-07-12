import type { Metadata } from 'next';
import { LegalTwoCovenants } from '@/components/art/legal-two-covenants';
import { LegalArticle, LegalMeta } from '@/components/legal-article';
import { PageHeader } from '@/components/page-header';
import { termsDoc } from '@/lib/legal/terms';

export const metadata: Metadata = {
  title: 'Terms of service',
  description:
    'The draft terms for Tessera — service terms for the managed cloud (not yet generally available) and the open-source license that governs self-hosted use.',
  alternates: { canonical: '/legal/terms' },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        eyebrow={termsDoc.eyebrow}
        title={termsDoc.title}
        lead={termsDoc.lead}
        art={<LegalTwoCovenants />}
      >
        <LegalMeta updated={termsDoc.updated} />
      </PageHeader>
      <LegalArticle doc={termsDoc} />
    </>
  );
}
