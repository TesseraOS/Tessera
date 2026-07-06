import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryGraph = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { queryGraph, getEffects: vi.fn(async () => ({ effects: [] })) },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// Keep React Flow out of jsdom — the canvas is verified in e2e + screenshots.
vi.mock('@/components/graph/graph-canvas', () => ({
  GraphCanvas: () => <div data-testid="graph-canvas" />,
}));

import { GraphView } from '@/components/graph/graph-view';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const GRAPH = {
  nodes: [
    { id: 'f1', kind: 'file', key: 'app.ts', label: 'app.ts', metadata: {} },
    { id: 'f2', kind: 'file', key: 'util.ts', label: 'util.ts', metadata: {} },
  ],
  edges: [
    {
      id: 'e1',
      from: 'f1',
      to: 'f2',
      kind: 'imports',
      rationale: null,
      confidence: null,
      origin: null,
      metadata: {},
    },
  ],
};

describe('GraphView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the graph stats, filters, and canvas', async () => {
    queryGraph.mockResolvedValue(GRAPH);
    renderWithClient(<GraphView />);

    expect(await screen.findByText('2 nodes · 1 edges')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /effects/i })).toBeInTheDocument();
  });

  it('shows an empty state when the graph is empty', async () => {
    queryGraph.mockResolvedValue({ nodes: [], edges: [] });
    renderWithClient(<GraphView />);
    expect(await screen.findByText('The knowledge graph is empty')).toBeInTheDocument();
  });

  it('shows an error state when the graph fails to load', async () => {
    queryGraph.mockRejectedValue(new Error('boom'));
    renderWithClient(<GraphView />);
    expect(await screen.findByText('Could not load the graph')).toBeInTheDocument();
  });

  it('search-to-focus selects a node and shows its detail panel', async () => {
    const user = userEvent.setup();
    queryGraph.mockResolvedValue(GRAPH);
    renderWithClient(<GraphView />);
    await screen.findByText('2 nodes · 1 edges');

    await user.type(screen.getByLabelText('Search nodes'), 'util');
    await user.click(await screen.findByText('util.ts'));

    // The side panel now shows the selected node + its connections.
    expect(await screen.findByText(/Connections/)).toBeInTheDocument();
  });
});
