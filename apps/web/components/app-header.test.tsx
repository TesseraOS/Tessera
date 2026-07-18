import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getRecentActivity = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getRecentActivity },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// The bell is the subject; the rest of the header rides on contexts (sidebar, next-themes,
// app router) that jsdom does not need to stand up for these branches.
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/components/custom-sidebar-trigger', () => ({ CustomSidebarTrigger: () => null }));
vi.mock('@/components/nav-user', () => ({ NavUser: () => null }));
vi.mock('@/components/appearance-switcher', () => ({ AppearanceSwitcher: () => null }));
vi.mock('@/lib/auth/use-session', () => ({ useSession: () => ({ identity: null }) }));

import { AppHeader } from '@/components/app-header';
import type { RecentActivityEvent } from '@/lib/api/types';

function event(overrides: Partial<RecentActivityEvent> = {}): RecentActivityEvent {
  return {
    id: 'evt-1',
    action: 'source.manage',
    target: '/v1/sources/:id/scan',
    actor: { principalId: 'local', kind: 'local' },
    at: new Date().toISOString(),
    ...overrides,
  };
}

function renderHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppHeader />
    </QueryClientProvider>,
  );
}

const openBell = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /notifications/i }));
};

describe('NotificationsMenu states (F-091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows a loading state while the fetch is in flight — never the empty-state copy', async () => {
    // A promise that never settles pins the query in `pending`.
    getRecentActivity.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    expect(await screen.findByText('Loading notifications…')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  it('states a load failure and recovers through Try again', async () => {
    getRecentActivity.mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    expect(await screen.findByText('Notifications could not be loaded.')).toBeInTheDocument();

    getRecentActivity.mockResolvedValue({ events: [event()] });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('button', { name: 'Source scan started — mark as read' }),
    ).toBeInTheDocument();
  });

  it('renders each entry as title + description subtext (user items 1/3)', async () => {
    getRecentActivity.mockResolvedValue({
      events: [event(), event({ id: 'evt-2', action: 'compile', target: '/v1/compile' })],
    });
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    const list = await screen.findByRole('list', { name: 'Recent notifications' });
    expect(list).toHaveTextContent('Source scan started');
    expect(list).toHaveTextContent('Indexing of new and changed source content began.');
    expect(list).toHaveTextContent('Context compiled');
    expect(list).toHaveTextContent('Context pack assembled from indexed sources and memory.');
  });
});
