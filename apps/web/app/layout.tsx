import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import {
  Architects_Daughter,
  Fira_Code,
  Inter,
  JetBrains_Mono,
  Source_Serif_4,
} from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { THEME_INIT_SCRIPT } from '@/lib/theme-script';
import { Providers } from './providers';

/*
 * Theme faces (DESIGN-SYSTEM §0.1, ADR-0047) — self-hosted by next/font, zero runtime
 * requests. `preload: false`: a face is fetched only when the active theme's CSS actually
 * uses its family, so non-Monkai fonts never touch the default critical path.
 * Monkai = Geist (preloaded, as before); Claude uses system stacks (no font cost).
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', preload: false });
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  preload: false,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  preload: false,
});
const architectsDaughter = Architects_Daughter({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-architects-daughter',
  preload: false,
});
const firaCode = Fira_Code({ subsets: ['latin'], variable: '--font-fira-code', preload: false });

export const metadata: Metadata = {
  title: {
    default: 'Tessera',
    template: '%s · Tessera',
  },
  description: 'Context & Memory OS for AI coding agents.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${architectsDaughter.variable} ${firaCode.variable}`}
    >
      <head>
        {/* Pre-paint theme application (no FOUC) — mirrors next-themes' own approach for mode. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
