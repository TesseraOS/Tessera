import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const search = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { search, compile: vi.fn(), getEffects: vi.fn(), getMemoryHistory: vi.fn() },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// jsdom has no layout, so the real virtualizer measures a 0-height viewport and renders nothing.
// Stub it to render every row; real virtualization is verified in e2e + screenshots. (Same approach
// as memory-view.test.tsx, which set this precedent for the first virtualized list.)
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 132,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 132 })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

import { SearchView } from '@/components/search/search-view';

const FILE_HIT = {
  ref: 'a'.repeat(64),
  score: 0.9,
  kind: 'file',
  label: 'src/reporting/ledger.ts',
  node: { kind: 'file', key: 'src/reporting/ledger' },
  snippet: {
    text: 'the ledger appends a compensating entry',
    matches: [{ start: 4, end: 10 }],
    truncatedStart: true,
    truncatedEnd: true,
  },
  signals: [{ signal: 'semantic', rank: 1, score: 0.9, weight: 0.5, contribution: 0.45 }],
};

const MEMORY_HIT = {
  ref: 'memory/lineage-1',
  score: 0.4,
  kind: 'memory',
  label: 'Use SQLite locally',
  signals: [{ signal: 'keyword', rank: 2, score: 0.4, weight: 1, contribution: 0.016 }],
};

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function type(query = 'ledger') {
  const user = userEvent.setup();
  renderWithClient(<SearchView />);
  await user.type(screen.getByLabelText('Search query'), query);
  return user;
}

describe('SearchView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.mockResolvedValue({ results: [FILE_HIT, MEMORY_HIT] });
  });

  it('shows the empty prompt before a query', () => {
    renderWithClient(<SearchView />);
    expect(screen.getByText('Search across everything')).toBeInTheDocument();
  });

  it('titles results by their label, never by the content hash (F-073)', async () => {
    await type();

    expect(await screen.findByText('src/reporting/ledger.ts')).toBeInTheDocument();
    expect(screen.getByText('Use SQLite locally')).toBeInTheDocument();
    // The regression this feature exists for: a 64-char sha256 rendered as a result title.
    expect(screen.queryByText('a'.repeat(64))).not.toBeInTheDocument();
  });

  it('asks the API for the extras a human UI needs', async () => {
    await type();
    await screen.findByText('src/reporting/ledger.ts');

    // A dashboard pays no token budget, so it opts in deliberately; agents stay lean by default.
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ include: { kind: true, node: true, snippet: {} } }),
    );
  });

  it('renders the excerpt with the matched term marked', async () => {
    await type();
    await screen.findByText('src/reporting/ledger.ts');

    const mark = document.querySelector('mark');
    expect(mark).not.toBeNull();
    // The offsets came from the same tokenizer the retriever matched with — so the highlight marks
    // what actually contributed to the hit.
    expect(mark).toHaveTextContent('ledger');
  });

  it('renders a snippet containing markup as TEXT — the XSS regression test', async () => {
    search.mockResolvedValue({
      results: [
        {
          ...FILE_HIT,
          snippet: {
            text: '<script>alert(1)</script> and <img src=x onerror=alert(2)>',
            matches: [],
            truncatedStart: false,
            truncatedEnd: false,
          },
        },
      ],
    });
    await type();
    await screen.findByText('src/reporting/ledger.ts');

    // The excerpt is ingested repository content — attacker-influenceable. The API sends offsets and
    // the client renders React elements, so this is inert text, not markup.
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });

  it('shows per-kind counts scoped to the current results', async () => {
    await type();
    await screen.findByText('src/reporting/ledger.ts');

    const group = screen.getByRole('group', { name: 'Filter results by kind' });
    expect(within(group).getByRole('button', { name: /file/i })).toHaveTextContent('1');
    expect(within(group).getByRole('button', { name: /memory/i })).toHaveTextContent('1');
    // Never a corpus-wide claim — the API returns one truncated ranked set, not a total.
    expect(screen.getByText('2 results for this query')).toBeInTheDocument();
    // A kind with no hits is offered but inert, rather than implying the corpus has none.
    expect(within(group).getByRole('button', { name: /symbol/i })).toBeDisabled();
  });

  it('filters by kind and says so honestly when nothing of that kind is present', async () => {
    search.mockResolvedValue({ results: [FILE_HIT] });
    const user = await type();
    await screen.findByText('src/reporting/ledger.ts');

    await user.click(screen.getByRole('button', { name: /file/i }));
    expect(screen.getByRole('button', { name: /file/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('src/reporting/ledger.ts')).toBeInTheDocument();
  });

  it('opens the detail Sheet on Enter and shows provenance without hover', async () => {
    const user = await type();
    await screen.findByText('src/reporting/ledger.ts');

    const listbox = screen.getByRole('listbox', { name: 'Search results' });
    listbox.focus();
    await user.keyboard('{Enter}');

    const sheet = await screen.findByRole('dialog');
    // Provenance is this product's claim — it must not require a mouse to read.
    expect(within(sheet).getByText('Why this ranked')).toBeInTheDocument();
    expect(within(sheet).getByRole('columnheader', { name: 'Rank' })).toBeInTheDocument();
    expect(within(sheet).getByRole('columnheader', { name: 'Contribution' })).toBeInTheDocument();
  });

  it('moves the active option with the arrow keys', async () => {
    const user = await type();
    await screen.findByText('src/reporting/ledger.ts');

    const listbox = screen.getByRole('listbox', { name: 'Search results' });
    listbox.focus();
    const first = listbox.getAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    const second = listbox.getAttribute('aria-activedescendant');
    expect(second).not.toBe(first);

    // `aria-activedescendant` MUST point at an element that exists, or a screen reader announces
    // nothing while the visuals look correct.
    expect(document.getElementById(second!)).not.toBeNull();

    await user.keyboard('{ArrowUp}');
    expect(listbox.getAttribute('aria-activedescendant')).toBe(first);
  });

  it('seeds the Inspector with the query AND the label, not the hash', async () => {
    const user = await type();
    await screen.findByText('src/reporting/ledger.ts');
    screen.getByRole('listbox', { name: 'Search results' }).focus();
    await user.keyboard('{Enter}');

    const sheet = await screen.findByRole('dialog');
    const link = within(sheet).getByRole('link', { name: /open in inspector/i });
    // The compile task IS the retrieval query — seeding it with a sha256 would feed a hash into FTS
    // and embeddings.
    expect(link).toHaveAttribute(
      'href',
      `/inspector?task=${encodeURIComponent('ledger — src/reporting/ledger.ts')}`,
    );
  });

  it('omits "what a change affects" for a result with no graph node', async () => {
    search.mockResolvedValue({ results: [MEMORY_HIT] });
    const user = await type();
    await screen.findByText('Use SQLite locally');
    screen.getByRole('listbox', { name: 'Search results' }).focus();
    await user.keyboard('{Enter}');

    const sheet = await screen.findByRole('dialog');
    // A memory has no node — the action is ABSENT, never disabled-with-a-lie.
    expect(within(sheet).queryByText(/what a change here affects/i)).not.toBeInTheDocument();
  });
});
