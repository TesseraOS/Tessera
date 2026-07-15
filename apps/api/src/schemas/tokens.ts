import { z } from 'zod/v4';
import { PERMISSIONS, ROLES } from '../auth/model.js';

/**
 * API-token self-service (F-046; NFR-2). Tokens are issued over the `TokenStore` port; the plaintext
 * secret is returned **exactly once** at create and never again (only its hash is stored). List/record
 * shapes never carry a secret.
 */

/** A stored token, projected to the wire — never the secret, never the tenant (stays off the wire). */
export const tokenRecordSchema = z.object({
  id: z.string(),
  principalId: z.string(),
  displayName: z.string().optional(),
  roles: z.array(z.enum(ROLES)),
  scopes: z.array(z.enum(PERMISSIONS)).optional(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  /** Derived: not revoked and not past `expiresAt`. */
  active: z.boolean(),
});

/** `GET /v1/tokens` — every token in the caller's tenant (including revoked/expired), for admin. */
export const tokenListResponseSchema = z.object({
  tokens: z.array(tokenRecordSchema),
});

/**
 * `POST /v1/tokens` body — issue a scoped token. `roles` grant permissions; optional `scopes` cap
 * them (least privilege); optional `expiresAt` (ISO) sets expiry. The server additionally forbids
 * minting a token more powerful than the caller.
 */
export const createTokenBodySchema = z.object({
  principalId: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  roles: z.array(z.enum(ROLES)).min(1),
  scopes: z.array(z.enum(PERMISSIONS)).optional(),
  expiresAt: z.iso.datetime().optional(),
});

/** `POST /v1/tokens` response — the record **plus** the one-time plaintext secret. */
export const createTokenResponseSchema = z.object({
  token: tokenRecordSchema,
  /** The plaintext bearer secret — shown once; store it now, it cannot be retrieved again. */
  secret: z.string(),
});

/** `DELETE /v1/tokens/:id` response. */
export const revokeTokenResponseSchema = z.object({
  id: z.string(),
  revoked: z.literal(true),
});

export type TokenRecord = z.infer<typeof tokenRecordSchema>;
export type CreateTokenBody = z.infer<typeof createTokenBodySchema>;
