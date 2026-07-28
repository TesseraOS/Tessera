import { UnauthorizedError } from '@tessera/core';
import type { ZodFastify } from '../../app-types.js';
import type { AuditLog } from '../../audit/index.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import {
  listNotifications,
  newestNotificationAt,
  unreadCountFor,
  type NotificationKind,
  type NotificationQuery,
  type NotificationStore,
} from '../../notifications/index.js';
import {
  markAllReadBodySchema,
  markReadBodySchema,
  notificationPreferencesResponseSchema,
  notificationPreferencesUpdateSchema,
  notificationsQuerySchema,
  notificationsResponseSchema,
  readStateResponseSchema,
  type MarkReadBody,
  type NotificationPreferencesUpdate,
  type NotificationsQueryString,
} from '../../schemas/notifications.js';
import type { FastifyRequest } from 'fastify';

/**
 * The principal these routes read and write state for.
 *
 * Notification state is **self-scoped**: there is no surface here that reads or writes another
 * principal's marks or preferences, which is why the mutating routes require authentication rather
 * than a permission — the same posture as `GET /v1/me`. A principal may always see and configure
 * itself.
 */
function principalOf(request: FastifyRequest): string {
  const context = request.authContext;
  if (context === undefined || context === null) {
    // Defensive: the auth hook throws first under a credential-requiring provider. In zero-auth
    // Local mode there is always a principal (LOCAL_PRINCIPAL), which is how the local dashboard
    // gets read state without signing in.
    throw new UnauthorizedError('Authentication required.');
  }
  return context.principal.id;
}

/**
 * `/v1/notifications` (F-065; FR-38/FR-49, ADR-0064) — the notification centre and the
 * agent-readable "what changed since my last session" surface.
 *
 * A notification is a **projection of the audit trail**, so this router owns no event store: it
 * reads the trail (tenant-scoped via `forTenant`, ADR-0033) and joins it with the two things that
 * cannot be derived — this principal's read state and preferences, from the injected
 * {@link NotificationStore}.
 *
 * **Reads require `stats:read`** (the narrowed, member-visible view of workspace activity that
 * `/v1/stats/activity/recent` also serves; viewer upward holds it). **Reads are not audited**: the
 * list is fetched on every page load and a row per load would flood the very trail it projects —
 * the posture `/v1/stats` established. **Preference writes are audited** (`notification.manage`),
 * because "who turned off token-change alerts?" is a question about suppressing a security signal.
 */
export function registerNotificationRoutes(
  app: ZodFastify,
  audit: AuditLog,
  notifications: NotificationStore,
): void {
  /** The read state + preferences this request's principal is entitled to, in one place. */
  async function contextFor(request: FastifyRequest): Promise<{
    principalId: string;
    store: NotificationStore;
    context: {
      readState: Awaited<ReturnType<NotificationStore['readState']>>;
      preferences: Awaited<ReturnType<NotificationStore['preferences']>>;
    };
  }> {
    const principalId = principalOf(request);
    const store = notifications.forTenant(tenantOf(request));
    const [readState, preferences] = await Promise.all([
      store.readState(principalId),
      store.preferences(principalId),
    ]);
    return { principalId, store, context: { readState, preferences } };
  }

  app.get<{ Querystring: NotificationsQueryString }>(
    '/notifications',
    {
      preHandler: requirePermission('stats:read'),
      schema: {
        tags: ['notifications'],
        summary: 'What changed in this workspace, typed and filtered by your preferences.',
        description:
          'A projection of the audit trail into notification kinds, joined with YOUR read state ' +
          '(cross-device) and preferences. Newest first; `limit` defaults to 20, max 50. Carries no ' +
          'rendered message text — the `kind` is the message, so clients localize and agents stay ' +
          'token-lean. Not audited: it is fetched on every page load.',
        querystring: notificationsQuerySchema,
        response: { 200: notificationsResponseSchema },
      },
    },
    async (request) => {
      const { context } = await contextFor(request);
      const { kind, severity, unread, limit, cursor } = request.query;
      const query: NotificationQuery = {
        ...(kind !== undefined ? { kinds: kind } : {}),
        ...(severity !== undefined ? { severity } : {}),
        ...(unread !== undefined ? { unreadOnly: unread } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      };
      return listNotifications(audit.forTenant(tenantOf(request)), context, query);
    },
  );

  app.post<{ Body: MarkReadBody }>(
    '/notifications/read',
    {
      // No permission beyond authentication: a read mark is self-scoped and cannot affect another
      // principal or another tenant. Requiring `stats:read` would be theatre; requiring a *write*
      // permission would mean a viewer could see a badge but never clear it.
      schema: {
        tags: ['notifications'],
        summary: 'Mark specific notifications read (idempotent). Cross-device.',
        body: markReadBodySchema,
        response: { 200: readStateResponseSchema },
      },
    },
    async (request) => {
      const { principalId, store, context } = await contextFor(request);
      const readState = await store.markRead(principalId, request.body.ids);
      const unreadCount = await unreadCountFor(audit.forTenant(tenantOf(request)), {
        readState,
        preferences: context.preferences,
      });
      return { watermark: readState.watermark, readIds: [...readState.readIds], unreadCount };
    },
  );

  app.post(
    '/notifications/read-all',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Mark everything currently visible to you as read. Cross-device.',
        description:
          'The watermark is taken from the STORE’s newest notification, not from the request: a ' +
          'client’s page may be stale or narrowed by a filter, and letting it name the instant ' +
          'would let it mark rows it was never shown. Kinds you have muted are excluded, so this ' +
          'never claims a row you cannot see.',
        body: markAllReadBodySchema,
        response: { 200: readStateResponseSchema },
      },
    },
    async (request) => {
      const { principalId, store, context } = await contextFor(request);
      const scopedAudit = audit.forTenant(tenantOf(request));
      const newest = await newestNotificationAt(scopedAudit, context.preferences);
      if (newest === null) {
        // Nothing to mark. Returning the current state (rather than 204/an error) keeps the client's
        // reconciliation path identical whether or not the workspace has history yet.
        const readState = await store.readState(principalId);
        return { watermark: readState.watermark, readIds: [...readState.readIds], unreadCount: 0 };
      }
      const readState = await store.markAllRead(principalId, newest);
      const unreadCount = await unreadCountFor(scopedAudit, {
        readState,
        preferences: context.preferences,
      });
      return { watermark: readState.watermark, readIds: [...readState.readIds], unreadCount };
    },
  );

  app.get(
    '/notifications/preferences',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Which notification kinds reach you. Always complete — every kind is present.',
        response: { 200: notificationPreferencesResponseSchema },
      },
    },
    async (request) => {
      const store = notifications.forTenant(tenantOf(request));
      return { preferences: await store.preferences(principalOf(request)) };
    },
  );

  app.put<{ Body: NotificationPreferencesUpdate }>(
    '/notifications/preferences',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Update your notification preferences (partial; merged over the stored record).',
        description:
          'Send only the kinds you are changing. A partial update rather than a full record so a ' +
          'client built before a kind existed cannot mute it by omission. Audited.',
        body: notificationPreferencesUpdateSchema,
        response: { 200: notificationPreferencesResponseSchema },
      },
      // Audited, unlike the reads: turning off a kind suppresses a signal (token changes are a
      // security fact), and "who did that, and when?" must be answerable from the trail.
      config: { audit: 'notification.manage' },
    },
    async (request) => {
      const store = notifications.forTenant(tenantOf(request));
      return {
        preferences: await store.setPreferences(principalOf(request), toUpdate(request.body)),
      };
    },
  );
}

/**
 * Drop keys sent as an explicit `null`/`undefined` in the JSON body.
 *
 * An absent key means "leave it alone"; a key present with no value must mean the same thing, not
 * "set it to nothing". Without this the store would write `undefined` into the merged record and
 * `withPreferenceDefaults` would silently turn it back on — a toggle that appears to save and then
 * reverts.
 */
function toUpdate(
  body: NotificationPreferencesUpdate,
): Readonly<Partial<Record<NotificationKind, boolean>>> {
  const entries = Object.entries(body).filter(
    (entry): entry is [NotificationKind, boolean] => typeof entry[1] === 'boolean',
  );
  return Object.fromEntries(entries) as Readonly<Partial<Record<NotificationKind, boolean>>>;
}
