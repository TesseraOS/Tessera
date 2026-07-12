import type { Metadata } from 'next';
import { LegalArticle } from '@/components/legal-article';
import { termsDoc } from '@/lib/legal/terms';

export const metadata: Metadata = {
  title: 'Terms of service',
  description:
    'The draft terms for Tessera — service terms for the managed cloud (not yet generally available) and the open-source license that governs self-hosted use.',
  alternates: { canonical: '/legal/terms' },
};

export default function TermsPage() {
  return <LegalArticle doc={termsDoc} />;
}
