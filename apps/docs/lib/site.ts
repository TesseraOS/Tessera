/**
 * Site identity & cross-surface URLs. No hardcoded domains anywhere else (marketing
 * convention): deploys configure NEXT_PUBLIC_* (see .env.example); defaults are the
 * local dev ports so the three surfaces link to each other out of the box.
 */
export const siteConfig = {
  name: 'Tessera',
  title: 'Tessera Docs',
  tagline: 'The context & memory OS for AI coding agents',
  description:
    'Documentation for Tessera: quickstart, concepts, how-to guides, per-agent MCP setup, ' +
    'REST API / MCP tool / CLI references, and deployment guides for local and self-hosted runs.',
  /** This docs site. */
  siteUrl: process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:3003',
  /** The marketing site (apex). */
  marketingUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002',
  /** The dashboard. */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
} as const;
