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
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Persistent {@link TokenStore} over the storage `SqliteStore`'s Drizzle handle (ADR-0030) — so issued
 * API tokens **survive restarts** (the in-memory adapter in `@tessera/api` does not). Secrets are
 * **hashed at rest** with the same scheme as the in-memory adapter (`hashApiTokenSecret`); the plaintext
 * is returned once, at issue. Mirrors the sqlite memory/graph adapters: create the table if absent.
 */

const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  secretHash: text('secret_hash').notNull(),
  tenantId: text('tenant_id').notNull(),
  principalId: text('principal_id').notNull(),
  displayName: text('display_name'),
  roles: text('roles', { mode: 'json' }).$type<Role[]>().notNull(),
  scopes: text('scopes', { mode: 'json' }).$type<Permission[]>(),
  createdAt: text('created_at').notNull(),
  revokedAt: text('revoked_at'),
  expiresAt: text('expires_at'),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    display_name TEXT,
    roles TEXT NOT NULL,
    scopes TEXT,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    expires_at TEXT
  )
`;

/** Add `expires_at` to a table created before F-046 (pre-launch; F-024 owns real migrations). */
const ADD_EXPIRES_AT = sql`ALTER TABLE api_tokens ADD COLUMN expires_at TEXT`;

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

export interface SqliteTokenStoreOptions {
  /** Override the token-id generator (tests). */
  readonly idFactory?: () => string;
  /** Override the secret generator (tests); must return a full `tsk_…` secret. */
  readonly secretFactory?: () => string;
  /** Injectable clock (tests). */
  readonly now?: () => Date;
}

export function createSqliteTokenStore(
  db: BetterSQLite3Database,
  options: SqliteTokenStoreOptions = {},
): TokenStore {
  const idFactory = options.idFactory ?? (() => randomBytes(8).toString('hex'));
  const secretFactory = options.secretFactory ?? newApiTokenSecret;
  const now = options.now ?? (() => new Date());

  db.run(CREATE_TABLE);
  // Backfill the F-046 expiry column on a pre-existing table (idempotent — ignore "duplicate column").
  try {
    db.run(ADD_EXPIRES_AT);
  } catch {
    // column already present
  }
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (secret_hash)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens (tenant_id)`);

  return {
    issue(input: IssueTokenInput) {
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
      db.insert(apiTokens)
        .values({
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
        })
        .run();
      return Promise.resolve({ token: secret, record });
    },

    verify(token: string) {
      const rows = db
        .select()
        .from(apiTokens)
        .where(
          and(eq(apiTokens.secretHash, hashApiTokenSecret(token)), isNull(apiTokens.revokedAt)),
        )
        .all();
      const row = rows[0];
      if (row === undefined) return Promise.resolve(null);
      const record = toRecord(row);
      return Promise.resolve(isExpired(record, now()) ? null : record);
    },

    revoke(id: string) {
      db.update(apiTokens)
        .set({ revokedAt: now().toISOString() })
        .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
        .run();
      return Promise.resolve();
    },

    list(tenantId) {
      const rows = db.select().from(apiTokens).where(eq(apiTokens.tenantId, tenantId)).all();
      return Promise.resolve(rows.map(toRecord));
    },
  };
}
