import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

/**
 * Docs site (ADR-0035): static-first — every content route is statically generated at
 * build time; there is no authenticated data fetching and the site never calls the
 * authenticated API (NFR-17).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

const withMDX = createMDX();

export default withMDX(nextConfig);
