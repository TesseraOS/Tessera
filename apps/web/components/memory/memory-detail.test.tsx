import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const memoryHistory = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { memoryHistory },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

import { MemoryDetail } from '@/components/memory/memory-detail';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const base = {
  lineageId: 'l1',
  kind: 'decision' as const,
  body: 'body',
  scope: 'api',
  confidence: 1,
  metadata: {},
};

describe('MemoryDetail', () => {
  it('renders the current version and its supersede chain (oldest→current)', async () => {
    memoryHistory.mockResolvedValue({
      versions: [
        {
          ...base,
          id: 'v1',
          title: 'First take',
          version: 1,
          supersedes: null,
          supersededBy: 'v2',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        {
          ...base,
          id: 'v2',
          title: 'Revised decision',
          version: 2,
          supersedes: 'v1',
          supersededBy: null,
          createdAt: '2026-07-02T00:00:00.000Z',
        },
      ],
    });

    renderWithClient(<MemoryDetail lineageId="l1" onOpenChange={vi.fn()} />);

    // Current = the head (v2). Both versions appear in the history.
    expect(await screen.findAllByText('Revised decision')).not.toHaveLength(0);
    expect(screen.getByText('First take')).toBeInTheDocument();
    expect(screen.getByText('current')).toBeInTheDocument();
  });
});
