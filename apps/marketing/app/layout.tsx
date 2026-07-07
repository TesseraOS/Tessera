import type { Metadata, Viewport } from 'next';
import type React from 'react';
import { Instrument_Sans, Instrument_Serif } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';
import { MotionProvider } from '@/lib/motion';
import { siteConfig } from '@/lib/site';
import './globals.css';

/* Brand faces (BRAND.md §3) — self-hosted by next/font; zero runtime third-party requests. */
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

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
  // Mirrors --background (dusk) in globals.css — see the design-lint allowIn for this file.
  themeColor: '#161013',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${instrumentSerif.variable} ${GeistMono.variable}`}
    >
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
