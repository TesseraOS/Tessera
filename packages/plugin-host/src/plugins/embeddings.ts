import { createFakeEmbeddings, createTransformersEmbeddings, type Embeddings } from '@tessera/ai';
import { z } from 'zod';
import type { Plugin } from '../domain.js';

const fakeConfigSchema = z.object({
  dimension: z.number().int().positive().optional(),
  model: z.string().min(1).optional(),
});
export type FakeEmbeddingsConfig = z.infer<typeof fakeConfigSchema>;

/** First-party **ai-provider** plugin: deterministic fake embeddings (offline; for tests/dev). */
export const fakeEmbeddingsPlugin: Plugin<FakeEmbeddingsConfig, Embeddings> = {
  manifest: {
    id: 'tessera.ai.fake-embeddings',
    kind: 'ai-provider',
    name: 'Fake embeddings',
    version: '0.0.0',
    configSchema: fakeConfigSchema,
  },
  setup(config) {
    return {
      capability: createFakeEmbeddings({
        ...(config.dimension !== undefined ? { dimension: config.dimension } : {}),
        ...(config.model !== undefined ? { model: config.model } : {}),
      }),
    };
  },
};

const transformersConfigSchema = z.object({ model: z.string().min(1).optional() });
export type TransformersEmbeddingsConfig = z.infer<typeof transformersConfigSchema>;

/** First-party **ai-provider** plugin: local Transformers.js embeddings (downloads a model on setup). */
export const transformersEmbeddingsPlugin: Plugin<TransformersEmbeddingsConfig, Embeddings> = {
  manifest: {
    id: 'tessera.ai.transformers-embeddings',
    kind: 'ai-provider',
    name: 'Transformers.js embeddings',
    version: '0.0.0',
    configSchema: transformersConfigSchema,
  },
  async setup(config) {
    return {
      capability: await createTransformersEmbeddings(
        config.model !== undefined ? { model: config.model } : {},
      ),
    };
  },
};
