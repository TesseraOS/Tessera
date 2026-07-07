import type { Metadata, Viewport } from 'next';
import type React from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { siteConfig } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: `${siteConfig.name} — context & memory OS for AI coding agents`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  // Mirrors --background in globals.css (the one deliberate hex outside tokens — see
  // the design-lint allowIn for this file).
  themeColor: '#030303',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
