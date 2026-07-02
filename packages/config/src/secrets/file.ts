import { readFile } from 'node:fs/promises';
import { ValidationError } from '@tessera/core';
import { requireSecret, type SecretsProvider } from './provider.js';

export interface FileSecretsOptions {
  /** Path to a JSON file mapping secret keys to string values. */
  readonly path: string;
}

/** {@link SecretsProvider} backed by a JSON file (loaded and cached on first access). */
export function createFileSecretsProvider(options: FileSecretsOptions): SecretsProvider {
  let cache: Record<string, unknown> | undefined;

  async function load(): Promise<Record<string, unknown>> {
    if (cache === undefined) {
      let raw: string;
      try {
        raw = await readFile(options.path, 'utf8');
      } catch (cause) {
        throw new ValidationError('secrets file is not readable', {
          details: { path: options.path },
          cause,
        });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        throw new ValidationError('secrets file is not valid JSON', {
          details: { path: options.path },
          cause,
        });
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ValidationError('secrets file must be a JSON object', {
          details: { path: options.path },
        });
      }
      cache = parsed as Record<string, unknown>;
    }
    return cache;
  }

  const get = async (key: string): Promise<string | undefined> => {
    const value = (await load())[key];
    return typeof value === 'string' ? value : undefined;
  };
  return { get, require: (key) => requireSecret(get, key) };
}
