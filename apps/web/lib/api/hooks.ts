'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { AuditQuery, CaptureMemoryBody, CompileBody } from './types';

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
