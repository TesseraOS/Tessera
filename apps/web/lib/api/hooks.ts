'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  AuditQuery,
  CaptureMemoryBody,
  CompileBody,
  EditMemoryBody,
  EffectsQuery,
  GraphQuery,
  MemoryListFilter,
  RegisterSourceBody,
} from './types';

/** Debounced global search (FR-41). The caller debounces `query`; the hook runs when non-empty. */
export function useSearch(query: string, limit?: number) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search', trimmed, limit ?? null],
    queryFn: () => api.search(limit === undefined ? { query: trimmed } : { query: trimmed, limit }),
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

/** A source's most recent scan status — GET /v1/sources/:id/scan. */
export function useScanStatus(id: string, enabled = true) {
  return useQuery({
    queryKey: ['scan-status', id],
    queryFn: () => api.getScanStatus(id),
    enabled: enabled && id.length > 0,
    staleTime: 5_000,
  });
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
