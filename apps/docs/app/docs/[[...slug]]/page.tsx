import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { MDXComponents } from 'mdx/types';
import { OpenAPIPage } from '@/components/openapi-page';
import { openapi } from '@/lib/openapi';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  // Generated REST-reference pages (frontmatter `_openapi`) render through
  // <OpenAPIPage/> with their spec preloaded server-side; every other page gets the
  // standard component set.
  const extra: MDXComponents = {};
  if (page.data._openapi !== undefined) {
    const preload = await openapi.preloadOpenAPIPage(page);
    extra['OpenAPIPage'] = (pageProps) => <OpenAPIPage {...pageProps} {...preload} />;
  }

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents(extra)} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
