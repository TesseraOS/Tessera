import type { NextConfig } from 'next';

/**
 * Marketing site (ADR-0035): static-first — every route is statically generated at build
 * time; there is no authenticated data fetching (NFR-17).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
