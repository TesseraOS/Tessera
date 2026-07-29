import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getFragment = vi.hoisted(() => vi.fn());
const memoryHistory = vi.hoisted(() => vi.fn());
const getEffects = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getFragment, memoryHistory, getEffects },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

import { SearchDetail } from '@/components/search/search-detail';

const FILE_HIT = {
  ref: 'a'.repeat(64),
  score: 0.9,
  kind: 'file',
  label: 'src/reporting/ledger.ts',
  signals: [{ signal: 'semantic', rank: 1, score: 0.9, weight: 0.5, contribution: 0.45 }],
};

const SYMBOL_HIT = { ...FILE_HIT, ref: 'b'.repeat(64), kind: 'symbol', label: 'postEntry' };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderDetail(result: unknown) {
  return render(
    <SearchDetail result={result as never} query="ledger" onOpenChange={() => undefined} />,
    { wrapper },
  );
}

/** The file-body section of the search detail Sheet (F-075 — closes F-061's SL-2). */
describe('SearchDetail file body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEffects.mockResolvedValue({ effects: [] });
    memoryHistory.mockResolvedValue({ versions: [] });
  });

  it('renders the fetched body for a file hit', async () => {
    getFragment.mockResolvedValue({
      ref: FILE_HIT.ref,
      kind: 'code',
      text: 'export const settlement = roundHalfEven(amount);',
      path: 'src/reporting/ledger.ts',
      truncated: false,
    });

    renderDetail(FILE_HIT);

    expect(await screen.findByText(/roundHalfEven/)).toBeInTheDocument();
    expect(getFragment).toHaveBeenCalledWith(FILE_HIT.ref);
  });

  it('says when the body was truncated, using the length actually delivered', async () => {
    getFragment.mockResolvedValue({
      ref: FILE_HIT.ref,
      kind: 'markdown',
      text: 'x'.repeat(1234),
      truncated: true,
    });

    renderDetail(FILE_HIT);

    expect(await screen.findByText(/Showing the first 1,234 characters/)).toBeInTheDocument();
  });

  it('renders nothing extra when the body cannot be read — never an empty box', async () => {
    // A ref this tenant does not own 404s exactly like one that never existed. The panel must show
    // no File section at all rather than an empty one implying the file is blank.
    getFragment.mockRejectedValue(new Error('not found'));

    renderDetail(FILE_HIT);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'File' })).not.toBeInTheDocument();
    });
  });

  it('does not request a body for a symbol hit — there is no corpus fragment behind it', () => {
    renderDetail(SYMBOL_HIT);

    expect(getFragment).not.toHaveBeenCalled();
  });

  it('renders a body containing markup as TEXT, not as HTML', async () => {
    // The body is a whole ingested file — the largest slice of attacker-influenceable repo content
    // this app renders. Same regression guard F-061 wrote for snippets, at a much bigger surface.
    getFragment.mockResolvedValue({
      ref: FILE_HIT.ref,
      kind: 'code',
      text: '<script>alert(1)</script>',
      truncated: false,
    });

    const { container } = renderDetail(FILE_HIT);

    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});
