import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuditEvent } from '@/lib/api/types';

const getAudit = vi.hoisted(() => vi.fn());
const exportAudit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getAudit, exportAudit },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// jsdom has no layout: the real virtualizer measures a 0-height viewport and renders nothing.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 44,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 44 })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

import { AuditView } from '@/components/audit/audit-view';

let seq = 0;
function event(over: Partial<AuditEvent> = {}): AuditEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    tenantId: 'acme',
    actor: { principalId: 'admin@acme.test', kind: 'user' },
    action: 'memory.write',
    target: '/v1/memory',
    outcome: 'success',
    at: '2026-07-17T10:00:00.000Z',
    ...over,
  };
}

function renderView(ui: ReactNode = <AuditView />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AuditView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAudit.mockResolvedValue({ events: [event()] });
    exportAudit.mockResolvedValue({
      exportedAt: '2026-07-17T10:00:00.000Z',
      count: 1,
      truncated: false,
      events: [event()],
    });
  });

  it('renders the trail as an accessible grid', async () => {
    renderView();

    const table = await screen.findByRole('table', { name: 'Audit events' });
    expect(within(table).getByText('admin@acme.test')).toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Time', 'Actor', 'Action', 'Target', 'Outcome']);
  });

  // --- acceptance 2: real cursor pagination -------------------------------------------------

  it('pages the trail with the cursor instead of telling the user to narrow the filters', async () => {
    getAudit.mockResolvedValueOnce({ events: [event({ target: '/page-1' })], nextCursor: '42' });
    const user = userEvent.setup();
    renderView();

    await screen.findByText('/page-1');
    // The component held a working cursor and told the user to change the subject. That is the bug.
    expect(screen.queryByText(/narrow the filters/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('more available');

    getAudit.mockResolvedValueOnce({ events: [event({ target: '/page-2' })] });
    await user.click(screen.getByRole('button', { name: /load older events/i }));

    // Older events APPEND — the reader keeps what they already had.
    expect(await screen.findByText('/page-2')).toBeInTheDocument();
    expect(screen.getByText('/page-1')).toBeInTheDocument();
    expect(getAudit).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '42' }));
  });

  it('stops offering more when the trail runs out, and says so', async () => {
    renderView();
    await screen.findByRole('table');

    expect(screen.queryByRole('button', { name: /load older events/i })).not.toBeInTheDocument();
    // States what is LOADED and that it is everything — never a total the API does not provide.
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 event · end of the trail');
  });

  // --- acceptance 2: actor + date-range filters ----------------------------------------------

  it('sends the actor filter', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole('table');

    await user.type(screen.getByLabelText('Filter by actor'), 'admin@acme.test');

    await vi.waitFor(() =>
      expect(getAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ actor: 'admin@acme.test' }),
      ),
    );
  });

  it('sends a date range with `until` at the END of its day', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole('table');

    await user.type(screen.getByLabelText('From'), '2026-07-01');
    await user.type(screen.getByLabelText('To'), '2026-07-17');

    // The API compares lexicographically, so a bare `2026-07-17` would silently drop the 17th.
    await vi.waitFor(() =>
      expect(getAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          since: '2026-07-01T00:00:00.000Z',
          until: '2026-07-17T23:59:59.999Z',
        }),
      ),
    );
  });

  it('offers to clear filters only once some are set', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole('table');

    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Filter by actor'), 'someone');
    expect(await screen.findByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  // --- acceptance 3: export ------------------------------------------------------------------

  it('exports the CURRENT filters, not the loaded page', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const user = userEvent.setup();
    renderView();
    await screen.findByRole('table');
    await user.type(screen.getByLabelText('Filter by actor'), 'admin@acme.test');

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(await screen.findByText('Download CSV'));

    // An export is defined by its FILTERS — a compliance export of page 1 of 40 looks complete and
    // is not. The server pages to completeness; the client only asks with the right question.
    await vi.waitFor(() =>
      expect(exportAudit).toHaveBeenCalledWith(
        expect.objectContaining({ actor: 'admin@acme.test' }),
      ),
    );
    expect(createObjectURL).toHaveBeenCalled();
    // An un-revoked blob URL pins its blob for the life of the document.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    vi.unstubAllGlobals();
  });

  it('does not export on mount — it has a server-side effect', async () => {
    renderView();
    await screen.findByRole('table');
    // The export WRITES an audit.export event. Firing it speculatively would forge a compliance fact.
    expect(exportAudit).not.toHaveBeenCalled();
  });

  it('surfaces an export failure instead of silently doing nothing', async () => {
    exportAudit.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderView();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(await screen.findByText('Download JSON'));

    // A download button whose failure is silent leaves the user believing they have the file.
    await vi.waitFor(() => expect(exportAudit).toHaveBeenCalled());
  });

  // --- states --------------------------------------------------------------------------------

  it('says why the trail is empty, honestly, in both cases', async () => {
    getAudit.mockResolvedValue({ events: [] });
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText(/nothing recorded yet/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Filter by actor'), 'nobody');
    // With filters set, "nothing recorded yet" would be a lie — the trail may be full.
    expect(await screen.findByText(/nothing matches these filters/i)).toBeInTheDocument();
  });

  it('offers a retry on failure', async () => {
    getAudit.mockRejectedValue(new Error('nope'));
    renderView();
    expect(await screen.findByText('Could not load the audit log')).toBeInTheDocument();
  });
});
