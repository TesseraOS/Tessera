import type { Metadata, Viewport } from 'next';
import type React from 'react';
import { Instrument_Serif, Manrope } from 'next/font/google';
import { MotionProvider } from '@/lib/motion';
import { siteConfig } from '@/lib/site';
import { ThemeProvider } from '@/lib/theme';
import '@tessera/mascot/styles.css';
import './globals.css';

/* Brand faces (BRAND.md §3, ADR-0044) — self-hosted by next/font; zero runtime requests. */
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
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
  // Mirrors --background per theme (see the design-lint allowIn for this file).
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#161013' },
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${instrumentSerif.variable}`}
    >
      <body>
        <ThemeProvider>
          <MotionProvider>{children}</MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
