import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

/**
 * Built-in Orama search over the MDX source — a local index, no third-party request
 * (NFR-17: the public surfaces make zero external calls).
 */
export const { GET } = createFromSource(source);
