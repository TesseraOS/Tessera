import type { Metadata } from 'next';
import { LegalOneTile } from '@/components/art/legal-one-tile';
import { LegalArticle, LegalMeta } from '@/components/legal-article';
import { PageHeader } from '@/components/page-header';
import { cookiesDoc } from '@/lib/legal/cookies';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description:
    'The Tessera marketing site sets no cookies and makes no third-party requests — one localStorage entry stores your theme choice, written only if you set one.',
  alternates: { canonical: '/legal/cookies' },
};

export default function CookiesPage() {
  return (
    <>
      <PageHeader
        eyebrow={cookiesDoc.eyebrow}
        title={cookiesDoc.title}
        lead={cookiesDoc.lead}
        art={<LegalOneTile />}
      >
        <LegalMeta updated={cookiesDoc.updated} />
      </PageHeader>
      <LegalArticle doc={cookiesDoc} />
    </>
  );
}
