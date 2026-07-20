import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site';

/** Robots (NFR-17): everything is public; point crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
  };
}
