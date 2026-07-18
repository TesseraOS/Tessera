'use client';

import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useApiEvent } from './events';
import type {
  AuditExportQuery,
  AuditQuery,
  CaptureMemoryBody,
  CompileBody,
  EditMemoryBody,
  EffectsQuery,
  GraphQuery,
  MemoryListFilter,
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
  return useMutation({
    mutationFn: (body: CompileBody) => api.compile(body),
  });
}

/** Capture a memory (FR-13) — POST /v1/memory. Refreshes the memory list on success. */
export function useCaptureMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CaptureMemoryBody) => api.captureMemory(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] }),
  });
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
  return useMutation({
    mutationFn: (query: AuditExportQuery) => api.exportAudit(query),
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

/**
 * The Overview activity chart's data (F-084). A plain query — it does not self-invalidate on live
 * events like {@link useStats}: the chart is daily-granular, so a new event this second does not
 * change today's bar meaningfully, and the 60s staleness picks it up on the next natural refetch
 * without a burst of refetches during a scan.
 */
export function useActivity(days?: number) {
  return useQuery({
    queryKey: ['stats', 'activity', days ?? null],
    queryFn: () => api.getActivity(days),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });
}

/** Remove a source — DELETE /v1/sources/:id. Invalidates the source list on success. */
export function useRemoveSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeSource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
  });
}

/** Revoke a token — DELETE /v1/tokens/:id. Refreshes the token list on success. */
export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
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
