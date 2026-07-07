/**
 * Site configuration — every cross-surface URL is env-driven because the final TLD is
 * undecided (ADR-0035); the design-lint gate rejects hardcoded tessera.* domains.
 * NEXT_PUBLIC_* values are inlined at build time.
 */
const url = (value: string | undefined, fallback: string): string =>
  (value ?? fallback).replace(/\/+$/, '');

export const siteConfig = {
  name: 'Tessera',
  tagline: 'The context & memory OS for AI coding agents',
  description:
    'Tessera ingests your repos and decisions, remembers them across sessions, and compiles budgeted, cited context packages for any AI coding agent over MCP.',
  siteUrl: url(process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:3002'),
  appUrl: url(process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3100'),
  docsUrl: url(process.env.NEXT_PUBLIC_DOCS_URL, 'http://localhost:3003'),
} as const;
