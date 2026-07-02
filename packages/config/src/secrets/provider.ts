import { NotFoundError } from '@tessera/core';

/**
 * Secrets access port (FR-53; ARCHITECTURE §132). Local adapters read from the environment or a
 * file; cloud profiles implement the same port over KMS/vault. Secrets are never logged or
 * persisted by Tessera.
 */
export interface SecretsProvider {
  /** The secret for `key`, or `undefined` if not set. */
  get(key: string): Promise<string | undefined>;
  /** The secret for `key`; throws a typed error if it is not set. */
  require(key: string): Promise<string>;
}

/** Implement `require` from a `get` — fail fast (without echoing the value) when a secret is absent. */
export async function requireSecret(
  get: (key: string) => Promise<string | undefined>,
  key: string,
): Promise<string> {
  const value = await get(key);
  if (value === undefined) {
    throw new NotFoundError('required secret is not set', { details: { key } });
  }
  return value;
}
