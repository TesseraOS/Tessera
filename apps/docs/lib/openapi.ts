import { createOpenAPI } from 'fumadocs-openapi/server';

/**
 * The OpenAPI server for the REST reference (ADR-0054 §4). Input is the generated,
 * drift-gated copy of the SDK's captured spec — the docs never describe an endpoint the
 * running server does not serve. The `./generated/openapi.json` key must match the
 * `document` prop baked into the generated MDX pages (see scripts/generate.mjs).
 */
export const openapi = createOpenAPI({
  input: ['./generated/openapi.json'],
});
