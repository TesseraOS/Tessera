import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/client', () => ({
  api: {
    search: vi.fn(async () => ({
      results: [
        {
          ref: 'src/a.ts',
          score: 0.9,
          signals: [{ signal: 'semantic', rank: 1, score: 0.9, weight: 0.5, contribution: 0.45 }],
        },
      ],
    })),
    compile: vi.fn(),
  },
  TesseraApiError: class extends Error {},
}));

import { SearchView } from '@/components/search/search-view';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SearchView', () => {
  it('shows the empty prompt before a query', () => {
    renderWithClient(<SearchView />);
    expect(screen.getByText('Search across everything')).toBeInTheDocument();
  });

  it('renders results with provenance after typing', async () => {
    const user = userEvent.setup();
    renderWithClient(<SearchView />);

    await user.type(screen.getByLabelText('Search query'), 'fusion');

    expect(await screen.findByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('semantic')).toBeInTheDocument();
  });
});
