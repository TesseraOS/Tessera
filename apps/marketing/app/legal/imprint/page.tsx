import type { Metadata } from 'next';
import { LegalArticle } from '@/components/legal-article';
import { imprintDoc } from '@/lib/legal/imprint';

export const metadata: Metadata = {
  title: 'Imprint',
  description:
    'Operator identity for the Tessera public surfaces — product facts today, with entity, address, register, and contact details pending counsel review.',
  alternates: { canonical: '/legal/imprint' },
};

export default function ImprintPage() {
  return <LegalArticle doc={imprintDoc} />;
}
