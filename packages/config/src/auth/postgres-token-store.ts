import { randomBytes } from 'node:crypto';
import {
  hashApiTokenSecret,
  isExpired,
  newApiTokenSecret,
  type ApiTokenRecord,
  type IssueTokenInput,
  type Permission,
  type Role,
  type TokenStore,
} from '@tessera/api/auth';
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for the Postgres `api_tokens` table — the same columns the SQLite adapter defines,
 * with `jsonb` where SQLite stores JSON text.
 */
const apiTokens = pgTable('api_tokens', {
  id: text('id').primaryKey(),
  secretHash: text('secret_hash').notNull(),
  tenantId: text('tenant_id').notNull(),
  principalId: text('principal_id').notNull(),
  displayName: text('display_name'),
  roles: jsonb('roles').$type<Role[]>().notNull(),
  scopes: jsonb('scopes').$type<Permission[]>(),
  createdAt: text('created_at').notNull(),
  revokedAt: text('revoked_at'),
  expiresAt: text('expires_at'),
});

/**
 * Schema for the Postgres {@link TokenStore} (F-056, ADR-0059 §2).
 *
 * The unique index on `secret_hash` is **not** cosmetic: `verify` looks a token up by hash, and a
 * duplicate hash would make that lookup ambiguous. On one node SQLite's index was enough; across
 * replicas racing to issue, the database is the only place that constraint can actually hold.
 */
export const pgTokenStoreMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-api-tokens-001',
    up: [
      `CREATE TABLE IF NOT EXISTS api_tokens (
        id text PRIMARY KEY,
        secret_hash text NOT NULL,
        tenant_id text NOT NULL,
        principal_id text NOT NULL,
        display_name text,
        roles jsonb NOT NULL,
        scopes jsonb,
        created_at text NOT NULL,
        revoked_at text,
        expires_at text
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (secret_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens (tenant_id)`,
    ],
  },
];

type TokenRow = typeof apiTokens.$inferSelect;

function toRecord(row: TokenRow): ApiTokenRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    principalId: row.principalId,
    ...(row.displayName !== null ? { displayName: row.displayName } : {}),
    roles: row.roles,
    ...(row.scopes !== null ? { scopes: row.scopes } : {}),
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
  };
}

export interface PostgresTokenStoreOptions {
  /** Override the token-id generator (tests). */
  readonly idFactory?: () => string;
  /** Override the secret generator (tests); must return a full `tsk_…` secret. */
  readonly secretFactory?: () => string;
  /** Injectable clock (tests). */
  readonly now?: () => Date;
}

/**
 * Postgres {@link TokenStore} (ADR-0030) — issued API tokens survive restarts and are visible to
 * every replica, which is what makes token auth work at all behind a load balancer.
 *
 * Secrets are **hashed at rest** with the same `hashApiTokenSecret` scheme the other adapters use;
 * the plaintext is returned once, at issue, and never stored.
 *
 * **Tables must already exist** ({@link pgTokenStoreMigrations}).
 */
export function createPostgresTokenStore(
  db: NodePgDatabase,
  options: PostgresTokenStoreOptions = {},
): TokenStore {
  const idFactory = options.idFactory ?? (() => randomBytes(8).toString('hex'));
  const secretFactory = options.secretFactory ?? newApiTokenSecret;
  const now = options.now ?? (() => new Date());

  return {
    async issue(input: IssueTokenInput) {
      const id = idFactory();
      const secret = secretFactory();
      const record: ApiTokenRecord = {
        id,
        tenantId: input.tenantId,
        principalId: input.principalId,
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        roles: input.roles,
        ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
        createdAt: now().toISOString(),
        revokedAt: null,
        expiresAt: input.expiresAt ?? null,
      };
      await db.insert(apiTokens).values({
        id,
        secretHash: hashApiTokenSecret(secret),
        tenantId: record.tenantId,
        principalId: record.principalId,
        displayName: input.displayName ?? null,
        roles: [...input.roles],
        scopes: input.scopes !== undefined ? [...input.scopes] : null,
        createdAt: record.createdAt,
        revokedAt: null,
        expiresAt: input.expiresAt ?? null,
      });
      return { token: secret, record };
    },

    async verify(token: string) {
      const rows = await db
        .select()
        .from(apiTokens)
        .where(
          and(eq(apiTokens.secretHash, hashApiTokenSecret(token)), isNull(apiTokens.revokedAt)),
        );
      const row = rows[0];
      if (row === undefined) return null;
      const record = toRecord(row);
      return isExpired(record, now()) ? null : record;
    },

    async revoke(id: string) {
      await db
        .update(apiTokens)
        .set({ revokedAt: now().toISOString() })
        .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)));
    },

    async list(tenantId) {
      const rows = await db.select().from(apiTokens).where(eq(apiTokens.tenantId, tenantId));
      return rows.map(toRecord);
    },
  };
}
