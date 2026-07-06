import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/client', () => ({
  api: {
    getHealth: vi.fn(async () => ({ status: 'ok' as const })),
    getReady: vi.fn(async () => ({
      status: 'ready' as const,
      checks: [{ name: 'sqlite', ok: true, detail: 'open' }],
    })),
    getPlans: vi.fn(async () => ({
      plans: [
        {
          id: 'free',
          name: 'Free',
          priceCents: 0,
          interval: null,
          entitlements: { maxMonthlyCompiles: 1000, maxSeats: 1, maxTokensPerCompile: 8000 },
        },
      ],
    })),
  },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

import { SettingsView } from '@/components/settings/settings-view';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SettingsView', () => {
  it('renders deployment health, dependency checks, and plan budgets from the API', async () => {
    renderWithClient(<SettingsView />);

    // Deployment: endpoint + a dependency check row from /ready.
    expect(screen.getByText('http://localhost:3000')).toBeInTheDocument();
    expect(await screen.findByText('sqlite')).toBeInTheDocument();
    expect(await screen.findAllByText('Live')).not.toHaveLength(0);

    // Plans: the free plan's compile budget from /v1/billing/plans.
    expect(await screen.findByText('Plans & budgets')).toBeInTheDocument();
    expect(screen.getByText('8,000')).toBeInTheDocument();

    // Governance posture is a read-only card with a link to /governance.
    expect(screen.getByText('Governance & retention')).toBeInTheDocument();
  });
});
