import Link from 'next/link';
import { siteConfig } from '@/lib/site';

/**
 * Docs home. Scaffold version — the designed home (hero art, section index, Tess) lands
 * with the design foundation increment.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">{siteConfig.title}</h1>
      <p className="text-fd-muted-foreground max-w-xl">{siteConfig.description}</p>
      <Link
        href="/docs"
        className="bg-fd-primary text-fd-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
      >
        Open the documentation
      </Link>
    </main>
  );
}
