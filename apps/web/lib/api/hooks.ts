'use client';

import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useApiEvent } from './events';
import { useProjectStore } from '@/lib/store/project';
import type { CheckoutBody, NotificationPage, NotificationPreferencesUpdate } from '@tessera/sdk';
import type {
  AuditExportQuery,
  AuditQuery,
  CaptureMemoryBody,
  CompileBody,
  EditMemoryBody,
  EffectsQuery,
  GraphQuery,
  Memory,
  MemoryListFilter,
  MemoryListResponse,
  RegisterSourceBody,
} from './types';

/**
 * What the dashboard asks `/v1/search` to attach to each hit (F-061).
 *
 * All three are opt-in because a ranked answer is billed to every caller on every call (NFR-4) — but
 * that budget is an *agent's* concern. A human looking at a search page pays nothing per token, and
 * needs all of it: `kind` for the filters and counts, `snippet` for the excerpt, `node` for "show
 * effects". So the dashboard opts in deliberately, and agents stay lean by default.
 */
const DASHBOARD_INCLUDE = { kind: true, node: true, snippet: {} } as const;

/** Debounced global search (FR-41). The caller debounces `query`; the hook runs when non-empty. */
export function useSearch(query: string, limit?: number) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search', trimmed, limit ?? null],
    queryFn: () =>
      api.search({
        query: trimmed,
        ...(limit === undefined ? {} : { limit }),
        include: DASHBOARD_INCLUDE,
      }),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });
}

/** Compile a Context Package (FR-44) — a mutation (explicit submit, not auto-run). */
export function useCompile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CompileBody) => api.compile(body),
    // A compile writes the trail but emits no SSE event — refresh the Recent activity feed (F-089).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY }),
  });
}

/**
 * Capture a memory (FR-13) — POST /v1/memory, applied **optimistically** (F-064; FR-49).
 *
 * Capture is the one write in the dashboard where optimism is safe: it is an append, the server
 * assigns no field the user is looking at while they wait, and a failure is fully reversible by
 * dropping the row. Contrast the writes that are deliberately NOT optimistic — a scan is
 * asynchronous and its outcome is genuinely unknown, and an edit appends a superseding version whose
 * number the server owns.
 *
 * The optimistic row is marked `pending` so a view can render it as in-flight rather than pretending
 * it is durable. On error the previous cache is restored wholesale — reversing by id would lose any
 * concurrent write that landed in between.
 */
export function useCaptureMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CaptureMemoryBody) => api.captureMemory(body),
    onMutate: async (body: CaptureMemoryBody) => {
      // Cancel in-flight list reads first: one resolving after this write would overwrite the
      // optimistic row with a server response that predates it.
      await queryClient.cancelQueries({ queryKey: ['memories'] });
      const previous = queryClient.getQueriesData<MemoryListResponse>({ queryKey: ['memories'] });
      const optimistic = optimisticMemory(body);
      queryClient.setQueriesData<MemoryListResponse>({ queryKey: ['memories'] }, (current) =>
        current === undefined
          ? current
          : { ...current, memories: [optimistic, ...current.memories] },
      );
      return { previous };
    },
    onError: (_error, _body, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    // Always refetch, success or failure: on success the optimistic row is replaced by the real one
    // (server id, timestamps, version), and on failure the restore above is confirmed against truth.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
      void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY });
    },
  });
}

/**
 * The prefix marking a locally-invented, not-yet-durable memory id.
 *
 * Pendingness rides on the **id** rather than on an extra `pending` field, because `Memory` is the
 * server's contract: adding a client-only flag to it would make every consumer's type lie about what
 * the API returns, and the alternative — an `as` cast — hides the same lie from the compiler.
 */
export const PENDING_MEMORY_PREFIX = 'pending:';

/** Whether a row is an optimistic placeholder rather than something the server has acknowledged. */
export function isPendingMemory(memory: Pick<Memory, 'id'>): boolean {
  return memory.id.startsWith(PENDING_MEMORY_PREFIX);
}

/** A locally-invented memory row shown while the capture is in flight. */
function optimisticMemory(body: CaptureMemoryBody): Memory {
  const now = new Date().toISOString();
  const id = `${PENDING_MEMORY_PREFIX}${now}`;
  return {
    id,
    lineageId: id,
    kind: body.kind,
    title: body.title,
    body: body.body,
    scope: body.scope ?? '',
    confidence: body.confidence ?? 1,
    metadata: body.metadata ?? {},
    version: 1,
    supersedes: null,
    // `null` means "this is the current head", which is exactly what the user just asserted.
    supersededBy: null,
    createdAt: now,
  };
}

/** List the current memories (FR-45), optionally filtered by kind/scope — GET /v1/memory. */
export function useMemories(filter: MemoryListFilter = {}) {
  return useQuery({
    queryKey: ['memories', filter],
    queryFn: () => api.listMemories(filter),
    staleTime: 10_000,
  });
}

/** The full version history of a lineage (FR-12), oldest first — GET /v1/memory/:id/history. */
export function useMemoryHistory(lineageId: string, enabled = true) {
  return useQuery({
    queryKey: ['memory-history', lineageId],
    queryFn: () => api.memoryHistory(lineageId),
    enabled: enabled && lineageId.length > 0,
    staleTime: 10_000,
  });
}

/** Edit a memory (FR-13) — PATCH appends a superseding version. Refreshes the list + the lineage. */
export function useEditMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineageId, body }: { lineageId: string; body: EditMemoryBody }) =>
      api.editMemory(lineageId, body),
    onSuccess: (_memory, { lineageId }) => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
      void queryClient.invalidateQueries({ queryKey: ['memory-history', lineageId] });
      void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY });
    },
  });
}

/** Query the audit trail (FR-48/55) — GET /v1/audit (admin-only). */
export function useAudit(query: AuditQuery = {}) {
  return useQuery({
    queryKey: ['audit', query],
    queryFn: () => api.getAudit(query),
    staleTime: 15_000,
  });
}

/**
 * The audit trail, paged for real (F-063). The API has always returned a keyset `nextCursor`; the
 * view held one and told the user to "narrow the filters to see older entries" instead of using it.
 *
 * The cursor is a stable keyset (`seq < cursor`), so new events arriving mid-read never shift a page
 * under the reader — which is what makes paging a compliance trail trustworthy rather than merely
 * possible.
 */
export function useAuditInfinite(query: AuditExportQuery = {}) {
  return useInfiniteQuery({
    queryKey: ['audit', 'infinite', query],
    queryFn: ({ pageParam }) =>
      api.getAudit({ ...query, ...(pageParam === undefined ? {} : { cursor: pageParam }) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });
}

/**
 * Export every audit event matching the filters (F-063) — a **mutation**, not a query: it has a
 * server-side effect (it writes an `audit.export` event to the trail), so it must never be
 * speculatively refetched, retried, or fired on mount.
 */
export function useAuditExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: AuditExportQuery) => api.exportAudit(query),
    // The export itself is an audited work action with no SSE event (F-089).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY }),
  });
}

// --- workspace stats (F-060/FR-38) ---

/** Coalescing window for SSE-triggered stat refetches — one scan can emit hundreds of events. */
const STATS_INVALIDATE_DEBOUNCE_MS = 500;

/**
 * The workspace summary — GET /v1/stats (F-060).
 *
 * Kept live by the **event stream, not polling**: any event that can change a number invalidates the
 * query, debounced so a 300-file scan triggers one refetch rather than 300. `staleTime` then covers
 * ordinary navigation back to the Overview.
 */
export function useStats() {
  const queryClient = useQueryClient();
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const invalidate = () => {
    if (pending.current !== undefined) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    }, STATS_INVALIDATE_DEBOUNCE_MS);
  };

  useApiEvent('document.ingested', invalidate);
  useApiEvent('document.removed', invalidate);
  useApiEvent('memory.captured', invalidate);
  useApiEvent('source.scan.completed', invalidate);

  useEffect(() => () => clearTimeout(pending.current), []);

  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    staleTime: 30_000,
  });
}

// --- recent activity (F-089) ---

/** Query-key prefix for the persisted Recent activity feed — invalidate this to refresh feed + bell. */
export const RECENT_ACTIVITY_QUERY_KEY = ['activity', 'recent'] as const;

/** How many rows the feed/bell request. One query serves both — they render the same entries. */
export const RECENT_ACTIVITY_LIMIT = 20;

/**
 * The persisted Recent activity feed + notifications bell data (F-089) — the last N successful work
 * actions from the audit trail (`GET /v1/stats/activity/recent`). Replaces F-060's in-memory
 * session store: a reload now shows the same recent history every other surface shows. Kept fresh
 * by `ActivitySync` (stream-driven, debounced invalidation) plus the trail-writing mutations above
 * that emit no SSE event (compile, token/audit-export actions).
 */
export function useRecentActivity(limit: number = RECENT_ACTIVITY_LIMIT) {
  return useQuery({
    queryKey: [...RECENT_ACTIVITY_QUERY_KEY, limit],
    queryFn: () => api.getRecentActivity(limit),
    staleTime: 30_000,
  });
}

/**
 * The Overview activity chart's data (F-084). A plain query — it does not self-invalidate on live
 * events like {@link useStats}: the chart is daily-granular, so a new event this second does not
 * change today's bar meaningfully, and the 60s staleness picks it up on the next natural refetch
 * without a burst of refetches during a scan.
 *
 * The buckets are the **viewer's** calendar days (F-088): the browser's current UTC offset rides
 * along (`-getTimezoneOffset()` = minutes east), and it is part of the query key so a machine that
 * changes timezone does not serve stale buckets from the old frame.
 */
export function useActivity(days?: number) {
  const tzOffset = -new Date().getTimezoneOffset();
  return useQuery({
    queryKey: ['stats', 'activity', days ?? null, tzOffset],
    queryFn: () => api.getActivity({ ...(days !== undefined ? { days } : {}), tzOffset }),
    staleTime: 60_000,
  });
}

/**
 * Per-tenant usage, entitlement, latency and quality proxies (F-057; FR-47/NFR-12) — the Analytics
 * and Billing views' one data source. Requires `admin:manage`.
 *
 * A plain query with the same reasoning as {@link useActivity}: the buckets are daily, so an event
 * this second cannot meaningfully move today's number, and self-invalidating on the stream would
 * burst refetches through a scan for no visible gain.
 *
 * `days` is in the key because the server clamps the window to what the store actually holds — two
 * window lengths are genuinely different answers, not one answer sliced.
 */
export function useUsage(days?: number) {
  return useQuery({
    queryKey: ['usage', days ?? null],
    queryFn: () => api.getUsage(days !== undefined ? { days } : {}),
    staleTime: 60_000,
  });
}

// --- sources (F-038/FR-62) ---

/** List registered sources — GET /v1/sources. */
export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => api.listSources(),
    staleTime: 10_000,
  });
}

/** Register a source — POST /v1/sources. Invalidates the source list on success. */
export function useRegisterSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterSourceBody) => api.registerSource(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      // Writes the trail without an SSE event — refresh the Recent activity feed (F-089).
      void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY });
    },
  });
}

/** Remove a source — DELETE /v1/sources/:id. Invalidates the source list on success. */
export function useRemoveSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeSource(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY });
    },
  });
}

/** Trigger a scan — POST /v1/sources/:id/scan. Refreshes the source list + scan status. */
export function useScanSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.scanSource(id),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: ['scan-status', id] });
    },
  });
}

/** Poll cadence for a running scan whose live stream may be down (F-087). */
const SCAN_STATUS_POLL_MS = 5_000;

/** A source's most recent scan status — GET /v1/sources/:id/scan. */
export function useScanStatus(id: string, enabled = true) {
  return useQuery({
    queryKey: ['scan-status', id],
    queryFn: () => api.getScanStatus(id),
    enabled: enabled && id.length > 0,
    staleTime: 5_000,
    // While a scan runs, this snapshot must resolve on its own (F-087): with the stream down
    // (sleep, proxy drop) nothing else would ever flip it out of `running`. Polls only while
    // running, stops the moment the state settles; with a healthy stream the completed/failed
    // events invalidate it first (useScanStatusSync), so this costs at most a confirming refetch.
    refetchInterval: (query) =>
      query.state.data?.state === 'running' ? SCAN_STATUS_POLL_MS : false,
  });
}

/**
 * Keep scan-status snapshots honest against the live stream (F-087). A background scan reports its
 * outcome over SSE (F-081); the cached `GET /v1/sources/:id/scan` result from mid-scan still says
 * `running` and nothing refetched it — the reported "stuck on Scanning until refresh" bug. Mounted
 * once by the sources view: completed/failed invalidates that source's snapshot + the source list,
 * so every consumer converges without a refresh.
 */
export function useScanStatusSync(): void {
  const queryClient = useQueryClient();
  const settle = (data: Record<string, unknown>) => {
    const sourceId = data['sourceId'];
    if (typeof sourceId !== 'string') return;
    void queryClient.invalidateQueries({ queryKey: ['scan-status', sourceId] });
    void queryClient.invalidateQueries({ queryKey: ['sources'] });
  };
  useApiEvent('source.scan.completed', settle);
  useApiEvent('source.scan.failed', settle);
}

// --- settings-facing reads (FR-46) ---

/** Subscription plans + entitlements (budgets) — GET /v1/billing/plans (public). */
export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: () => api.getPlans(), staleTime: 60_000 });
}

/**
 * Start a hosted checkout and hand back the provider URL (F-030; F-057). The caller decides what to
 * do with it — this hook never navigates, so a test can assert the call without a jsdom navigation.
 */
export function useCheckout() {
  return useMutation({
    mutationFn: (body: CheckoutBody) => api.createCheckout(body),
  });
}

/** Feature flags in effect for this tenant (F-058; FR-57) — GET /v1/flags. */
export function useFlags() {
  return useQuery({ queryKey: ['flags'], queryFn: () => api.getFlags(), staleTime: 60_000 });
}

/** Liveness — GET /health. */
export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => api.getHealth(), staleTime: 15_000 });
}

/** Readiness + dependency checks — GET /ready. */
export function useReady() {
  return useQuery({ queryKey: ['ready'], queryFn: () => api.getReady(), staleTime: 15_000 });
}

// --- knowledge graph (F-043) ---

/** A bounded subgraph for visualization — GET /v1/graph. */
export function useGraph(query: GraphQuery = {}) {
  return useQuery({
    queryKey: ['graph', query],
    queryFn: () => api.queryGraph(query),
    staleTime: 15_000,
  });
}

/** Ranked, path-bearing dependents of a node — GET /v1/effects (get_effects). */
export function useEffects(query: EffectsQuery | null) {
  return useQuery({
    queryKey: ['effects', query],
    queryFn: () => api.getEffects(query as EffectsQuery),
    enabled: query !== null,
    staleTime: 15_000,
  });
}

// --- account & access (F-046) ---

/** The RBAC catalog — static data, cached long; the dashboard derives roles/permissions from it. */
export function useRbac() {
  return useQuery({ queryKey: ['rbac'], queryFn: () => api.getRbac(), staleTime: Infinity });
}

/** The tenant's API tokens — GET /v1/tokens (admin:manage). `enabled` gates it to admins/token mode. */
export function useTokens(enabled = true) {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: () => api.listTokens(),
    enabled,
    retry: false,
    staleTime: 5_000,
  });
}

/** Issue a token — POST /v1/tokens. Refreshes the token list on success. */
export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createToken>[0]) => api.createToken(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens'] });
      void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY });
    },
  });
}

/** Revoke a token — DELETE /v1/tokens/:id. Refreshes the token list on success. */
export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeToken(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens'] });
      void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY });
    },
  });
}

/** The tenant's current subscription — GET /v1/billing/subscription (admin:manage). */
export function useSubscription(enabled = true) {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.getSubscription(),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}

// --- multi-project workspaces (F-050; ADR-0037) ---

/** The projects query key — invalidated by every project mutation. */
export const PROJECTS_QUERY_KEY = ['projects'] as const;

/** The caller's tenant's projects (the reserved default first). Backs the app-shell switcher. */
export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api.listProjects(),
    staleTime: 30_000,
  });
}

/** Create a project; the list refreshes on success (the caller switches to it). */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createProject({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
  });
}

/** Rename a project; the list refreshes on success. */
export function useRenameProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameProject(id, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
  });
}

/** Delete a project; the list refreshes on success (the caller falls back to the default). */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
  });
}

/**
 * Switch the active project (F-050): update the persisted selection, then invalidate the **whole** query
 * cache so every view refetches for the new project (memory, search, stats, sources, graph are all
 * project-scoped). The selection is read by the SDK fetch wrapper on the next request.
 */
export function useSwitchProject() {
  const queryClient = useQueryClient();
  const setSelectedProjectId = useProjectStore((state) => state.setSelectedProjectId);
  return (projectId: string) => {
    setSelectedProjectId(projectId);
    void queryClient.invalidateQueries();
  };
}

// --- notifications (F-065; ADR-0064) ---------------------------------------------------------

/** Query-key prefix for the notification centre — invalidate to refresh the bell and its badge. */
export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

/** Query key for this principal's notification preferences. */
export const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notifications', 'preferences'] as const;

/** How many rows the bell requests. Bounded — the panel is a cue, not a history browser. */
export const NOTIFICATIONS_LIMIT = 20;

/**
 * The notification centre (F-065) — the audit trail projected into typed kinds, joined with **this
 * principal's** read state.
 *
 * The read state now comes from the server, which is the whole point: F-089 kept marks in
 * `localStorage`, so a badge cleared on a laptop was still lit on a phone. Kept fresh by
 * `ActivitySync` alongside the recent-activity feed — they read the same underlying trail, so one
 * stream-driven invalidation serves both.
 */
export function useNotifications(limit: number = NOTIFICATIONS_LIMIT) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, limit],
    queryFn: () => api.listNotifications({ limit }),
    staleTime: 30_000,
  });
}

/**
 * Mark one notification read.
 *
 * Optimistic, and safe for the same reasons memory capture is (see {@link useCaptureMemory}): it is
 * idempotent, the server assigns nothing the user is watching, and a failure is fully reversible by
 * restoring the previous cache. Without optimism, clicking a row in the panel would stall on a
 * round-trip before the dot cleared — the one interaction in the app where latency is most visible,
 * because people clear several in a row.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationsRead([id]),
    onMutate: async (id: string) => {
      // Cancel in-flight reads first: one resolving after this would overwrite the optimistic mark
      // with a response that predates it.
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const previous = queryClient.getQueriesData<NotificationPage>({
        queryKey: NOTIFICATIONS_QUERY_KEY,
      });
      queryClient.setQueriesData<NotificationPage>(
        { queryKey: NOTIFICATIONS_QUERY_KEY },
        (current) => (current === undefined ? current : markReadInPage(current, id)),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      // Restored wholesale rather than by id — reversing one mark would lose any concurrent write
      // that landed in between.
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/**
 * Mark everything read. Not optimistic: the server decides the watermark from its own newest
 * notification, so the resulting state is genuinely unknown here — guessing it would be the kind of
 * optimism that has to be taken back.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}

/** This principal's notification preferences. Always complete — every kind is present. */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: () => api.getNotificationPreferences(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Update notification preferences (partial — only the kinds being changed).
 *
 * Invalidates the notification list too: muting a kind removes its rows and changes the badge, so
 * leaving the list cached would show entries the user just asked not to see.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: NotificationPreferencesUpdate) =>
      api.updateNotificationPreferences(update),
    onSuccess: (preferences) => {
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, preferences);
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/** One page with `id` marked read and the badge decremented. Pure — unit-tested directly. */
export function markReadInPage(page: NotificationPage, id: string): NotificationPage {
  const target = page.notifications.find((notification) => notification.id === id);
  if (target === undefined || target.read) return page;
  return {
    ...page,
    notifications: page.notifications.map((notification) =>
      notification.id === id ? { ...notification, read: true } : notification,
    ),
    // Never below zero: the count is bounded to a window, so a row outside it could otherwise drive
    // the badge negative.
    unreadCount: Math.max(0, page.unreadCount - 1),
  };
}
