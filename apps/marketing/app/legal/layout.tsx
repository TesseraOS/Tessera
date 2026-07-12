import type React from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';

/**
 * Shared shell for /legal/* (MARKETING-DESIGN §3.14): nav + main + footer once — each
 * page contributes only its metadata and its LegalDoc.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
