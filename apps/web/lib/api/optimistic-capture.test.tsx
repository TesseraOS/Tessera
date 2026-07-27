import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const captureMemory = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { captureMemory },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

import { isPendingMemory, useCaptureMemory } from '@/lib/api/hooks';
import type { Memory, MemoryListResponse } from '@/lib/api/types';

const EXISTING: Memory = {
  id: 'm-existing',
  lineageId: 'l-existing',
  kind: 'decision',
  title: 'Already captured',
  body: 'body',
  scope: 'api',
  confidence: 1,
  metadata: {},
  version: 1,
  supersedes: null,
  supersededBy: null,
  createdAt: '2026-07-01T10:00:00.000Z',
};

const BODY = { kind: 'decision' as const, title: 'New decision', body: 'because…' };

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seed the list the optimistic write has to prepend to.
  queryClient.setQueryData<MemoryListResponse>(['memories', {}], { memories: [EXISTING] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const list = () => queryClient.getQueryData<MemoryListResponse>(['memories', {}])?.memories ?? [];
  return { queryClient, wrapper, list };
}

describe('useCaptureMemory — optimistic capture (F-064; FR-49)', () => {
  it('shows the row BEFORE the server responds', async () => {
    // A promise we control, so the assertion happens strictly while the request is in flight —
    // asserting after resolution would pass with no optimism at all, which is the trap.
    let resolve: (value: unknown) => void = () => {};
    captureMemory.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { wrapper, list } = harness();
    const { result } = renderHook(() => useCaptureMemory(), { wrapper });

    result.current.mutate(BODY);

    await waitFor(() => {
      expect(list()).toHaveLength(2);
    });
    const [first] = list();
    expect(first?.title).toBe('New decision');
    expect(isPendingMemory(first!)).toBe(true);
    // The pre-existing row is untouched and still below the new one.
    expect(list()[1]?.id).toBe('m-existing');

    resolve({ ...EXISTING, id: 'm-new', title: 'New decision' });
  });

  it('rolls the row back when the capture fails', async () => {
    captureMemory.mockRejectedValue(new Error('nope'));
    const { wrapper, list } = harness();
    const { result } = renderHook(() => useCaptureMemory(), { wrapper });

    result.current.mutate(BODY);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    // Restored exactly — a failed write must leave no trace the user has to reason about.
    await waitFor(() => {
      expect(list()).toHaveLength(1);
    });
    expect(list()[0]?.id).toBe('m-existing');
  });

  it('marks only invented ids as pending, never a server id', () => {
    expect(isPendingMemory({ id: 'pending:2026-07-27T00:00:00.000Z' })).toBe(true);
    expect(isPendingMemory(EXISTING)).toBe(false);
    // A server id that merely CONTAINS the word is not pending — the check is anchored.
    expect(isPendingMemory({ id: 'mem-pending:1' })).toBe(false);
  });
});
