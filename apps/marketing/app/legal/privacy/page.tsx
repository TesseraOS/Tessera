import type { Metadata } from 'next';
import { LegalArticle } from '@/components/legal-article';
import { privacyDoc } from '@/lib/legal/privacy';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How the Tessera marketing site and product handle data — what is processed, what is not, and your rights, with unresolved facts marked for counsel review.',
  alternates: { canonical: '/legal/privacy' },
};

export default function PrivacyPage() {
  return <LegalArticle doc={privacyDoc} />;
}
