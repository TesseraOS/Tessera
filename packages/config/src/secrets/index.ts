import { ValidationError } from '@tessera/core';
import type { Env } from '../load.js';
import type { TesseraConfig } from '../schema.js';
import { createEnvSecretsProvider } from './env.js';
import { createFileSecretsProvider } from './file.js';
import type { SecretsProvider } from './provider.js';

export * from './provider.js';
export * from './env.js';
export * from './file.js';

/** Construct the configured {@link SecretsProvider} (env default; file when selected). */
export function createSecretsProvider(
  config: TesseraConfig['secrets'],
  env: Env = process.env,
): SecretsProvider {
  if (config.provider === 'file') {
    if (config.file === undefined) {
      throw new ValidationError('secrets.file is required when secrets.provider is "file"');
    }
    return createFileSecretsProvider({ path: config.file });
  }
  return createEnvSecretsProvider({ env, prefix: config.envPrefix });
}
