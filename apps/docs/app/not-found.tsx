import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Mascot } from '@tessera/mascot';
import { baseOptions } from '@/app/layout.config';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page is not part of the mosaic — head back to the documentation.',
};

/**
 * The 404 (DOCS-DESIGN §5, ADR-0046): a quiet statement with Tess in the `lost` mood —
 * the figure's missing tile is the page's metaphor, its gilded heart the page's one
 * gold moment. Tess is decorative; the headline carries the information.
 */
export default function NotFound() {
  return (
    <HomeLayout {...baseOptions}>
      <main className="flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-7">
            <p className="text-faint-foreground text-[0.8125rem] font-medium tracking-[0.08em] uppercase">
              404 — page not found
            </p>
            <h1 className="text-foreground mt-4 text-[clamp(2rem,2.5vw+1rem,3.25rem)] leading-[1.08] text-balance">
              A tile is <em className="text-rose">missing</em>.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed text-pretty">
              This page is not part of the mosaic — it may have moved, or it has not been written
              yet. The search (Ctrl K) knows every page that exists.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/docs"
                className="bg-primary text-primary-foreground rounded-lg px-5 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-[color-mix(in_oklab,var(--primary)_88%,var(--rose))]"
              >
                Open the documentation
              </Link>
              <Link
                href="/"
                className="text-rose text-sm font-medium underline underline-offset-4"
              >
                Docs home
              </Link>
            </div>
          </div>
          <div className="flex justify-center md:col-span-5 md:justify-end md:pr-8">
            <Mascot mood="lost" size={200} />
          </div>
        </div>
      </main>
    </HomeLayout>
  );
}
