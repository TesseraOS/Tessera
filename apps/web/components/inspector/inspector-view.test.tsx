import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('InspectorView', () => {
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
