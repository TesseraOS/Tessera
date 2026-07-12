import type { Metadata } from 'next';
import { LegalRightsLedger } from '@/components/art/legal-rights-ledger';
import { LegalArticle, LegalMeta } from '@/components/legal-article';
import { PageHeader } from '@/components/page-header';
import { gdprDoc } from '@/lib/legal/gdpr';

export const metadata: Metadata = {
  title: 'GDPR at Tessera',
  description:
    'How Tessera relates to the GDPR — controller and processor roles by deployment profile, the data-subject rights mapping, and items pending counsel review.',
  alternates: { canonical: '/legal/gdpr' },
};

export default function GdprPage() {
  return (
    <>
      <PageHeader
        eyebrow={gdprDoc.eyebrow}
        title={gdprDoc.title}
        lead={gdprDoc.lead}
        art={<LegalRightsLedger />}
      >
        <LegalMeta updated={gdprDoc.updated} />
      </PageHeader>
      <LegalArticle doc={gdprDoc} />
    </>
  );
}
