import { z } from 'zod/v4';
import {
  MAX_NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_KINDS,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_UNREAD_WINDOW,
} from '../notifications/model.js';

const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
const notificationSeveritySchema = z.enum(NOTIFICATION_SEVERITIES);

/**
 * `GET /v1/notifications` querystring (F-065). `limit` and `unread` arrive as strings.
 *
 * `kind` is repeatable (`?kind=a&kind=b`); a single value is coerced into a one-element array so the
 * handler never has to branch on arity.
 */
export const notificationsQuerySchema = z.object({
  kind: z
    .union([notificationKindSchema, z.array(notificationKindSchema)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional()
    .describe('Restrict to these kinds; repeat the parameter for several.'),
  severity: notificationSeveritySchema.optional().describe('Restrict to one severity.'),
  unread: z
    .stringbool()
    .optional()
    .describe('When true, return only notifications this principal has not read.'),
  limit: z.coerce.number().int().positive().max(MAX_NOTIFICATION_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional().describe('Opaque forward cursor from a prior page.'),
});

/** One notification: a typed, severity-tagged projection of an audit event, plus this reader's mark. */
export const notificationSchema = z.object({
  id: z.string().describe('The projected audit event id — what a read mark refers to.'),
  kind: notificationKindSchema,
  severity: notificationSeveritySchema,
  actor: z.object({ principalId: z.string(), kind: z.enum(['local', 'user', 'token']) }),
  target: z.string().optional().describe('Non-sensitive ref: an id or a route pattern (NFR-7).'),
  at: z.string().describe('ISO-8601 (UTC) instant the underlying action happened.'),
  read: z.boolean(),
});

/**
 * `GET /v1/notifications` response (F-065; ADR-0064).
 *
 * No rendered message text: the `kind` is the message. The dashboard renders copy through its i18n
 * catalog and an agent reads the kind, so an English sentence here would be untranslatable *and*
 * wasted tokens.
 */
export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  nextCursor: z
    .string()
    .optional()
    .describe(
      'Present iff more match beyond this page. A page can be SHORTER than `limit` while this is set — `unread=true` filters after the query — so page on this, never on length.',
    ),
  unreadCount: z
    .number()
    .int()
    .nonnegative()
    .describe(
      `Unread within the newest ${NOTIFICATION_UNREAD_WINDOW} notifications this principal's preferences admit — a bounded count, not a total.`,
    ),
});

/** `POST /v1/notifications/read` body — mark specific notifications read (idempotent). */
export const markReadBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_NOTIFICATION_PAGE_SIZE),
});

/**
 * `POST /v1/notifications/read-all` body — empty on purpose.
 *
 * The watermark is read from the **store**, not taken from the client: a client's page may be stale
 * or narrowed by a filter, and letting it name the instant would let it mark rows it was never
 * shown.
 */
export const markAllReadBodySchema = z.object({}).strict();

/** The read state after a mark — enough for a client to reconcile without a refetch. */
export const readStateResponseSchema = z.object({
  watermark: z.string().nullable(),
  readIds: z.array(z.string()),
  unreadCount: z.number().int().nonnegative(),
});

/** Per-kind notification preferences — always complete, every kind present. */
export const notificationPreferencesSchema = z.object(
  Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, z.boolean()])) as Record<
    (typeof NOTIFICATION_KINDS)[number],
    z.ZodBoolean
  >,
);

export const notificationPreferencesResponseSchema = z.object({
  preferences: notificationPreferencesSchema,
});

/**
 * `PUT /v1/notifications/preferences` body — a **partial** update, merged over what is stored.
 *
 * Partial rather than a full record so a client built before a kind existed cannot mute that kind by
 * omitting it. At least one key, so an empty body is a client bug rather than a silent no-op.
 */
export const notificationPreferencesUpdateSchema = z
  .object(
    Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, z.boolean().optional()])) as Record<
      (typeof NOTIFICATION_KINDS)[number],
      z.ZodOptional<z.ZodBoolean>
    >,
  )
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one preference must be supplied',
  });

export type NotificationsQueryString = z.infer<typeof notificationsQuerySchema>;
export type MarkReadBody = z.infer<typeof markReadBodySchema>;
export type NotificationPreferencesUpdate = z.infer<typeof notificationPreferencesUpdateSchema>;
