import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { Providers } from './providers';

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
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-screen">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
