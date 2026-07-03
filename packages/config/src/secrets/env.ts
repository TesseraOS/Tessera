import type { Env } from '../load.js';
import { requireSecret, type SecretsProvider } from './provider.js';

export interface EnvSecretsOptions {
  /** Environment to read (default `process.env`). */
  readonly env?: Env;
  /** Prefix prepended to each key (e.g. `TESSERA_SECRET_`). */
  readonly prefix?: string;
}

/** {@link SecretsProvider} backed by environment variables (the local default). */
export function createEnvSecretsProvider(options: EnvSecretsOptions = {}): SecretsProvider {
  const env = options.env ?? process.env;
  const prefix = options.prefix ?? '';
  const get = (key: string): Promise<string | undefined> => Promise.resolve(env[`${prefix}${key}`]);
  return { get, require: (key) => requireSecret(get, key) };
}
