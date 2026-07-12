import type { Metadata } from 'next';
import { LegalArticle } from '@/components/legal-article';
import { cookiesDoc } from '@/lib/legal/cookies';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description:
    'The Tessera marketing site sets no cookies and makes no third-party requests — one localStorage entry stores your theme choice, written only if you set one.',
  alternates: { canonical: '/legal/cookies' },
};

export default function CookiesPage() {
  return <LegalArticle doc={cookiesDoc} />;
}
