import type { Metadata } from 'next';
import { LegalNameplate } from '@/components/art/legal-nameplate';
import { LegalArticle, LegalMeta } from '@/components/legal-article';
import { PageHeader } from '@/components/page-header';
import { imprintDoc } from '@/lib/legal/imprint';

export const metadata: Metadata = {
  title: 'Imprint',
  description:
    'Operator identity for the Tessera public surfaces — product facts today, with entity, address, register, and contact details pending counsel review.',
  alternates: { canonical: '/legal/imprint' },
};

export default function ImprintPage() {
  return (
    <>
      <PageHeader
        eyebrow={imprintDoc.eyebrow}
        title={imprintDoc.title}
        lead={imprintDoc.lead}
        art={<LegalNameplate />}
      >
        <LegalMeta updated={imprintDoc.updated} />
      </PageHeader>
      <LegalArticle doc={imprintDoc} />
    </>
  );
}
