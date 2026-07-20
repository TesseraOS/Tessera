import { loader } from 'fumadocs-core/source';
import { docs } from '@/.source/server';

/**
 * The one content source (ADR-0035): MDX under `content/docs`, compiled by fumadocs-mdx.
 * Everything that lists, searches, or renders docs pages goes through this loader —
 * llms.txt/llms-full.txt included, so the agent-readable surface can never drift from
 * the human one.
 */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
