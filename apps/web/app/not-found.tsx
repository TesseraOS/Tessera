import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Mascot } from '@tessera/mascot';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

/**
 * Dashboard 404 (DESIGN-SYSTEM §11, ADR-0047) — a quiet statement with Tess in the `lost`
 * mood (one tile visibly missing = the metaphor; the gilded heart is the page's one warm
 * moment). Renders inside the app shell; Tess is decorative, the heading carries meaning.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-6 text-center">
      <Mascot mood="lost" size={168} />
      <div className="space-y-2">
        <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
          404 — not found
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          This tile isn&rsquo;t in the mosaic.
        </h1>
        <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed text-pretty">
          The page you&rsquo;re after may have moved, or it was never placed. Let&rsquo;s get you
          back to something solid.
        </p>
      </div>
      <Button asChild>
        <Link href="/">
          <ArrowLeft className="size-4" />
          Back to overview
        </Link>
      </Button>
    </div>
  );
}
