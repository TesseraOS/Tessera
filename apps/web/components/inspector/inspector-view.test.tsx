import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The Inspector reads `?task=` to seed a compile from a search result (F-061); in the app that comes
// from the router, so the test supplies one rather than the component defending against its absence.
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams.current }));

const compileFn = vi.hoisted(() => vi.fn());
const getStats = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { compile: compileFn, getStats, search: vi.fn() },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// jsdom has no EventSource; useStats subscribes to the live stream to invalidate itself (F-060).
vi.mock('@/lib/api/events', () => ({ useApiEvent: () => undefined }));

import { InspectorView } from '@/components/inspector/inspector-view';
import { useRecentCompiles } from '@/lib/store/recent-compiles';

const FRAGMENT = {
  ref: 'a'.repeat(64),
  text: 'export function postEntry() {}',
  kind: 'code',
  tokens: 50,
  score: 0.8,
  provenance: {
    retrievalScore: 0.8,
    signals: ['semantic'],
    source: { path: 'src/reporting/ledger.ts' },
  },
  whyIncluded: 'High semantic match',
};

const PACKAGE = {
  task: 't',
  budget: 2000,
  totalTokens: 120,
  sections: [{ title: 'code', fragments: [FRAGMENT] }],
  trace: {
    stages: [
      { stage: 'retrieve', inputCount: 10, outputCount: 5, dropped: [{ ref: 'x', reason: 'low' }] },
    ],
  },
  scores: { fragmentCount: 1, budgetAdherence: 0.9, provenanceCoverage: 1, redundancy: 0.1 },
};

/** What an empty compile really returns — vacuously perfect scores over zero fragments. */
const EMPTY_PACKAGE = {
  task: 't',
  budget: 2000,
  totalTokens: 0,
  sections: [],
  trace: { stages: [{ stage: 'retrieve', inputCount: 0, outputCount: 0, dropped: [] }] },
  scores: { fragmentCount: 0, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
};

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function compileTask(task = 'explain fusion') {
  const user = userEvent.setup();
  renderWithClient(<InspectorView />);
  await user.type(screen.getByLabelText('Task description'), task);
  await user.click(screen.getByRole('button', { name: 'Compile' }));
  return user;
}

describe('InspectorView', () => {
  beforeEach(() => {
    searchParams.current = new URLSearchParams();
    useRecentCompiles.getState().clear();
    vi.clearAllMocks();
    compileFn.mockResolvedValue(PACKAGE);
    getStats.mockResolvedValue({
      documents: 128,
      memories: 4,
      graph: { nodes: 10, effectLinks: 2 },
      sources: 2,
      lastScanAt: null,
    });
  });

  // --- F-061's contract: these must keep passing untouched -----------------------------------

  it('seeds the task from ?task= but does NOT auto-compile (F-061)', async () => {
    searchParams.current = new URLSearchParams({ task: 'ledger — src/reporting/ledger.ts' });
    renderWithClient(<InspectorView />);

    expect(screen.getByLabelText('Task description')).toHaveValue(
      'ledger — src/reporting/ledger.ts',
    );
    // A compile spends budget and is entitlement-clamped. Firing one from a navigation would burn
    // quota the user never chose to spend — so the seed prefills and waits for an explicit submit.
    expect(compileFn).not.toHaveBeenCalled();
  });

  it('starts empty when no task is seeded', () => {
    renderWithClient(<InspectorView />);
    expect(screen.getByLabelText('Task description')).toHaveValue('');
  });

  it('compiles and renders the package, provenance, and trace', async () => {
    await compileTask();

    expect(await screen.findByText('Package scores')).toBeInTheDocument();
    expect(screen.getByText('Compilation trace')).toBeInTheDocument();
    expect(screen.getByText(/High semantic match/)).toBeInTheDocument();
  });

  // --- Acceptance 1: honest empty guidance ---------------------------------------------------

  it('renders NO scores for an empty package — the regression this feature exists for', async () => {
    compileFn.mockResolvedValue(EMPTY_PACKAGE);
    await compileTask();
    await screen.findByText(/matched nothing|No sources|Nothing is indexed/);

    // The 2026-07-04 review saw "Budget adherence 100% · Provenance coverage 100% · 0 fragments" —
    // three full bars announcing a success that never happened. Assert on the ROLE, not the text:
    // `aria-valuenow={100}` was half the lie, announced to screen readers.
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.queryByText('Package scores')).not.toBeInTheDocument();
  });

  it('renders all three scores for a package that actually has fragments', async () => {
    await compileTask();
    await screen.findByText('Package scores');

    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
  });

  it('uses the workspace summary to explain WHY nothing matched', async () => {
    compileFn.mockResolvedValue(EMPTY_PACKAGE);
    getStats.mockResolvedValue({
      documents: 0,
      memories: 0,
      graph: { nodes: 0, effectLinks: 0 },
      sources: 0,
      lastScanAt: null,
    });
    await compileTask();

    // The trace proves retrieval returned nothing; only the stats can say it is because there is
    // nothing to retrieve FROM. That distinction is the difference between guidance and a shrug.
    expect(await screen.findByText('No sources are connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connect a source/i })).toHaveAttribute(
      'href',
      '/sources',
    );
  });

  it('still guides honestly when the workspace summary is unavailable', async () => {
    compileFn.mockResolvedValue(EMPTY_PACKAGE);
    getStats.mockRejectedValue(new Error('403'));
    await compileTask();

    // A scoped token without `stats:read` must soften the copy, never blank the Inspector.
    expect(await screen.findByText('Retrieval matched nothing for this task')).toBeInTheDocument();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  // --- Acceptance 2: agent-ready export ------------------------------------------------------

  it('copies the package as citation-preserving Markdown', async () => {
    const user = await compileTask();
    await screen.findByText('Package scores');
    // Spy on the clipboard `userEvent.setup()` installed, rather than replacing navigator — stubbing
    // the whole object out from under userEvent breaks its own pointer handling.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: /copy as markdown/i }));

    const copied = writeText.mock.calls[0]?.[0] ?? '';
    expect(copied).toContain('# Context:');
    // The citation is the real path, not the 64-char ref — the whole point of "citation-preserving".
    expect(copied).toContain('### src/reporting/ledger.ts');
    expect(copied).toContain('**Why included:** High semantic match');
  });

  it('copies a single fragment WITH its citation, never the bare text', async () => {
    const user = await compileTask();
    await screen.findByText('Package scores');
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: /copy src\/reporting\/ledger\.ts/i }));

    const copied = writeText.mock.calls[0]?.[0] ?? '';
    expect(copied).toContain('### src/reporting/ledger.ts');
    expect(copied).toContain('export function postEntry()');
  });

  it('tells the user when the clipboard refuses, instead of a silent no-op', async () => {
    const user = await compileTask();
    await screen.findByText('Package scores');
    // writeText REJECTS on an insecure origin, a denied permission, or an unfocused document. A copy
    // button whose failure is silent is worse than none: the user walks away believing they have it.
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));

    await user.click(screen.getByRole('button', { name: /copy as markdown/i }));

    // The button must not claim success it did not achieve.
    expect(screen.queryByRole('button', { name: /^copied$/i })).not.toBeInTheDocument();
  });

  it('downloads the package as JSON and releases the blob URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const user = await compileTask();
    await screen.findByText('Package scores');
    await user.click(screen.getByRole('button', { name: /download json/i }));

    expect(createObjectURL).toHaveBeenCalled();
    // An un-revoked blob URL pins its blob for the life of the document — megabytes per click.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    vi.unstubAllGlobals();
  });

  // --- Acceptance 3: compile controls --------------------------------------------------------

  it('keeps Token budget a labelled, fillable input (the e2e-full contract)', async () => {
    const user = userEvent.setup();
    renderWithClient(<InspectorView />);

    // tests/e2e-full drives this against a LIVE deployment with getByLabel('Token budget').fill().
    // Presets augment this control; they must never replace it (golden rule 6).
    const budget = screen.getByLabelText('Token budget');
    await user.clear(budget);
    await user.type(budget, '4000');
    expect(budget).toHaveValue(4000);
  });

  it('sets the budget from a preset', async () => {
    const user = userEvent.setup();
    renderWithClient(<InspectorView />);

    const presets = screen.getByRole('group', { name: 'Budget presets' });
    await user.click(within(presets).getByRole('button', { name: '8,000' }));

    expect(screen.getByLabelText('Token budget')).toHaveValue(8000);
  });

  it('sends the kind filters the form selected', async () => {
    const user = userEvent.setup();
    renderWithClient(<InspectorView />);

    await user.type(screen.getByLabelText('Task description'), 'explain fusion');
    const kinds = screen.getByRole('group', { name: 'Restrict to kinds' });
    await user.click(within(kinds).getByRole('button', { name: 'memory' }));
    await user.click(screen.getByRole('button', { name: 'Compile' }));

    expect(compileFn).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { kinds: ['memory'] } }),
    );
  });

  it('says the plan capped the compile — and stays silent when it did not', async () => {
    // The API clamps silently, but the returned budget IS the effective one and we know what we
    // asked for, so the disclosure needs no additive field.
    compileFn.mockResolvedValue({ ...PACKAGE, budget: 8000 });
    const user = userEvent.setup();
    renderWithClient(<InspectorView />);

    await user.type(screen.getByLabelText('Task description'), 'explain fusion');
    const budget = screen.getByLabelText('Token budget');
    await user.clear(budget);
    await user.type(budget, '20000');
    await user.click(screen.getByRole('button', { name: 'Compile' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('8,000');
    expect(notice).toHaveTextContent('20,000');
    // Scoped to THIS compile: claiming plan-wide enforcement would be false while MCP bypasses it
    // (F-077), and a non-admin cannot read their plan name anyway.
    expect(notice).not.toHaveTextContent(/free|pro plan/i);
  });

  it('shows no clamp notice when the budget came back unchanged', async () => {
    await compileTask();
    await screen.findByText('Package scores');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('remembers a compiled task and re-runs it on click, without auto-compiling', async () => {
    const user = await compileTask('explain fusion');
    await screen.findByText('Package scores');

    const recents = screen.getByRole('list', { name: 'Recent compiles' });
    expect(within(recents).getByText('explain fusion')).toBeInTheDocument();

    compileFn.mockClear();
    await user.click(within(recents).getByRole('button', { name: /explain fusion/ }));
    expect(compileFn).toHaveBeenCalledWith(expect.objectContaining({ task: 'explain fusion' }));
  });

  it('does not remember a task whose compile failed', async () => {
    compileFn.mockRejectedValue(new Error('boom'));
    await compileTask('doomed task');
    await screen.findByText('Compilation failed');

    // A task that never produced a package is not history worth re-running.
    expect(screen.queryByRole('list', { name: 'Recent compiles' })).not.toBeInTheDocument();
  });
});
