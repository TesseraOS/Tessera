import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The Inspector reads `?task=` to seed a compile from a search result (F-061); in the app that comes
// from the router, so the test supplies one rather than the component defending against its absence.
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams.current }));

vi.mock('@/lib/api/client', () => ({
  api: {
    compile: vi.fn(async () => ({
      task: 't',
      budget: 2000,
      totalTokens: 120,
      sections: [
        {
          title: 'Code',
          fragments: [
            {
              ref: 'src/a.ts',
              text: 'hello',
              kind: 'code',
              tokens: 50,
              score: 0.8,
              provenance: { retrievalScore: 0.8, signals: ['semantic'] },
              whyIncluded: 'High semantic match',
            },
          ],
        },
      ],
      trace: {
        stages: [
          {
            stage: 'retrieve',
            inputCount: 10,
            outputCount: 5,
            dropped: [{ ref: 'src/b.ts', reason: 'low score' }],
          },
        ],
      },
      scores: { fragmentCount: 1, budgetAdherence: 0.9, provenanceCoverage: 1, redundancy: 0.1 },
    })),
    search: vi.fn(),
  },
  TesseraApiError: class extends Error {},
}));

import { InspectorView } from '@/components/inspector/inspector-view';
import { api } from '@/lib/api/client';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('InspectorView', () => {
  beforeEach(() => {
    searchParams.current = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('seeds the task from ?task= but does NOT auto-compile (F-061)', async () => {
    searchParams.current = new URLSearchParams({ task: 'ledger — src/reporting/ledger.ts' });
    renderWithClient(<InspectorView />);

    expect(screen.getByLabelText('Task description')).toHaveValue(
      'ledger — src/reporting/ledger.ts',
    );
    // A compile spends budget and is entitlement-clamped. Firing one from a navigation would burn
    // quota the user never chose to spend — so the seed prefills and waits for an explicit submit.
    expect(api.compile).not.toHaveBeenCalled();
  });

  it('starts empty when no task is seeded', () => {
    renderWithClient(<InspectorView />);
    expect(screen.getByLabelText('Task description')).toHaveValue('');
  });

  it('compiles and renders the package, provenance, and trace', async () => {
    const user = userEvent.setup();
    renderWithClient(<InspectorView />);

    await user.type(screen.getByLabelText('Task description'), 'explain fusion');
    await user.click(screen.getByRole('button', { name: 'Compile' }));

    expect(await screen.findByText(/High semantic match/)).toBeInTheDocument();
    expect(screen.getByText('Compilation trace')).toBeInTheDocument();
    expect(screen.getByText(/low score/)).toBeInTheDocument();
  });
});
