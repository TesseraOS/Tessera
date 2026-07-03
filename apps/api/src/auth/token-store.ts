import { createHash, randomBytes } from 'node:crypto';
import type { Permission, Role, TenantId } from './model.js';

/**
 * Scoped, revocable API tokens (NFR-2). A `TokenStore` issues opaque bearer secrets and resolves a
 * presented secret to its {@link ApiTokenRecord}. Secrets are **hashed at rest** — the plaintext is
 * returned exactly once, at issue. The in-memory adapter here is the Local adapter; a persistent
 * (SQLite/Postgres) adapter is a documented seam (mirrors the memory/graph store adapters).
 */

/** A stored token grant — never contains the plaintext secret. */
export interface ApiTokenRecord {
  /** Stable, non-secret id (safe to show/log; used to revoke). */
  readonly id: string;
  readonly tenantId: TenantId;
  /** The principal the token acts as. */
  readonly principalId: string;
  readonly displayName?: string;
  readonly roles: readonly Role[];
  /** Least-privilege upper bound on permissions; `undefined` = the roles' full permissions. */
  readonly scopes?: readonly Permission[];
  readonly createdAt: string;
  /** ISO timestamp when revoked, else `null`. A revoked token never verifies. */
  readonly revokedAt?: string | null;
}

export interface IssueTokenInput {
  readonly tenantId: TenantId;
  readonly principalId: string;
  readonly roles: readonly Role[];
  readonly displayName?: string;
  readonly scopes?: readonly Permission[];
}

export interface IssuedToken {
  /** The plaintext bearer secret — shown **once**; only its hash is persisted. */
  readonly token: string;
  readonly record: ApiTokenRecord;
}

export interface TokenStore {
  /** Issue a token; returns the plaintext secret (once) + its record. */
  issue(input: IssueTokenInput): Promise<IssuedToken>;
  /** Resolve a presented secret to its record, or `null` when unknown or revoked. */
  verify(token: string): Promise<ApiTokenRecord | null>;
  /** Revoke by token id (idempotent; unknown id is a no-op). */
  revoke(id: string): Promise<void>;
  /** Every token record for a tenant (including revoked ones), for administration. */
  list(tenantId: TenantId): Promise<readonly ApiTokenRecord[]>;
}

/** Prefix marking a Tessera secret key — aids secret scanners and human recognition. */
const TOKEN_PREFIX = 'tsk_';

/**
 * SHA-256 hex of a token secret. Lookups key on this, so the plaintext is never stored or compared.
 * Exported so other {@link TokenStore} adapters (e.g. the SQLite adapter in `@tessera/config`) share
 * the exact scheme.
 */
export function hashApiTokenSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Generate a fresh `tsk_`-prefixed token secret. Shared across {@link TokenStore} adapters. */
export function newApiTokenSecret(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export interface InMemoryTokenStoreOptions {
  /** Override the token-id generator (tests). */
  readonly idFactory?: () => string;
  /** Override the secret-body generator (tests); the `tsk_` prefix is always prepended. */
  readonly secretFactory?: () => string;
  /** Injectable clock (tests). */
  readonly now?: () => Date;
}

/**
 * In-memory Local {@link TokenStore}: cryptographically random secrets, hashed at rest, revocable.
 * Records are keyed by secret hash (O(1) verify, no plaintext retained). Not durable across restarts
 * — persistence is the cloud/self-host adapter seam.
 */
export function createInMemoryTokenStore(options: InMemoryTokenStoreOptions = {}): TokenStore {
  const idFactory = options.idFactory ?? (() => randomBytes(8).toString('hex'));
  const secretFactory = options.secretFactory ?? (() => randomBytes(24).toString('base64url'));
  const now = options.now ?? (() => new Date());

  /** hash(secret) → record. */
  const byHash = new Map<string, ApiTokenRecord>();
  /** id → hash(secret), so `revoke(id)` can find the record. */
  const hashById = new Map<string, string>();

  return {
    issue(input) {
      const id = idFactory();
      const secret = `${TOKEN_PREFIX}${secretFactory()}`;
      const record: ApiTokenRecord = {
        id,
        tenantId: input.tenantId,
        principalId: input.principalId,
        roles: input.roles,
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
        createdAt: now().toISOString(),
        revokedAt: null,
      };
      const hash = hashApiTokenSecret(secret);
      byHash.set(hash, record);
      hashById.set(id, hash);
      return Promise.resolve({ token: secret, record });
    },

    verify(token) {
      const record = byHash.get(hashApiTokenSecret(token));
      if (record === undefined || (record.revokedAt !== undefined && record.revokedAt !== null)) {
        return Promise.resolve(null);
      }
      return Promise.resolve(record);
    },

    revoke(id) {
      const hash = hashById.get(id);
      if (hash !== undefined) {
        const record = byHash.get(hash);
        if (record !== undefined) {
          byHash.set(hash, { ...record, revokedAt: now().toISOString() });
        }
      }
      return Promise.resolve();
    },

    list(tenantId) {
      return Promise.resolve([...byHash.values()].filter((record) => record.tenantId === tenantId));
    },
  };
}
