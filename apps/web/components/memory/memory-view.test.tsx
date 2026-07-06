import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const listMemories = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: {
    listMemories,
    memoryHistory: vi.fn(async () => ({ versions: [] })),
    captureMemory: vi.fn(),
    editMemory: vi.fn(),
  },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// Keep Monaco out of the jsdom test — the authoring dialog's editor is a plain textarea here.
vi.mock('@/components/memory/memory-editor', () => ({
  MemoryEditor: ({ ariaLabel }: { ariaLabel: string }) => <textarea aria-label={ariaLabel} />,
}));

// jsdom has no layout, so the real virtualizer measures a 0-height viewport and renders nothing;
// stub it to render every row (real virtualization is verified in e2e + screenshots).
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 84,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 84,
        size: 84,
      })),
    measureElement: () => {},
  }),
}));

import { MemoryView } from '@/components/memory/memory-view';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const memory = {
  id: 'm1',
  lineageId: 'l1',
  kind: 'decision',
  title: 'Chose Fastify over Express',
  body: 'because…',
  scope: 'api',
  confidence: 1,
  metadata: {},
  version: 1,
  supersedes: null,
  supersededBy: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('MemoryView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders memories with their kind + title', async () => {
    listMemories.mockResolvedValue({ memories: [memory] });
    renderWithClient(<MemoryView />);

    expect(await screen.findByText('Chose Fastify over Express')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by kind')).toBeInTheDocument();
  });

  it('shows an empty state when there are no memories', async () => {
    listMemories.mockResolvedValue({ memories: [] });
    renderWithClient(<MemoryView />);

    expect(await screen.findByText('No memories yet')).toBeInTheDocument();
  });

  it('shows an error state when the list fails', async () => {
    listMemories.mockRejectedValue(new Error('connection refused'));
    renderWithClient(<MemoryView />);

    expect(await screen.findByText('Could not load memories')).toBeInTheDocument();
  });
});
