'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AuditQuery, CaptureMemoryBody, CompileBody, RegisterSourceBody } from './types';

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

/** Capture a memory (FR-13) — POST /v1/memory. */
export function useCaptureMemory() {
  return useMutation({
    mutationFn: (body: CaptureMemoryBody) => api.captureMemory(body),
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
