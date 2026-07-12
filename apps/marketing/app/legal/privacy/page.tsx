import type { Metadata } from 'next';
import { LegalRedactionGate } from '@/components/art/legal-redaction-gate';
import { LegalArticle, LegalMeta } from '@/components/legal-article';
import { PageHeader } from '@/components/page-header';
import { privacyDoc } from '@/lib/legal/privacy';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How the Tessera marketing site and product handle data — what is processed, what is not, and your rights, with unresolved facts marked for counsel review.',
  alternates: { canonical: '/legal/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow={privacyDoc.eyebrow}
        title={privacyDoc.title}
        lead={privacyDoc.lead}
        art={<LegalRedactionGate />}
      >
        <LegalMeta updated={privacyDoc.updated} />
      </PageHeader>
      <LegalArticle doc={privacyDoc} />
    </>
  );
}
