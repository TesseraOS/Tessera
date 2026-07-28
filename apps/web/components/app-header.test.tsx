import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NotificationPage } from '@tessera/sdk';

const listNotifications = vi.hoisted(() => vi.fn());
const markNotificationsRead = vi.hoisted(() => vi.fn());
const markAllNotificationsRead = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { listNotifications, markNotificationsRead, markAllNotificationsRead },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// The bell is the subject; the rest of the header rides on contexts (sidebar, next-themes,
// app router) that jsdom does not need to stand up for these branches.
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/components/custom-sidebar-trigger', () => ({ CustomSidebarTrigger: () => null }));
vi.mock('@/components/nav-user', () => ({ NavUser: () => null }));
vi.mock('@/components/appearance-switcher', () => ({ AppearanceSwitcher: () => null }));

import { AppHeader } from '@/components/app-header';

type Notification = NotificationPage['notifications'][number];

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'ntf-1',
    kind: 'scan.completed',
    severity: 'info',
    actor: { principalId: 'local', kind: 'local' },
    at: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

function page(overrides: Partial<NotificationPage> = {}): NotificationPage {
  const notifications = overrides.notifications ?? [notification()];
  return {
    notifications,
    unreadCount: notifications.filter((entry) => !entry.read).length,
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

describe('NotificationsMenu states (F-091, F-065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows a loading state while the fetch is in flight — never the empty-state copy', async () => {
    // A promise that never settles pins the query in `pending`.
    listNotifications.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    expect(await screen.findByText('Loading notifications…')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  it('states a load failure and recovers through Try again', async () => {
    listNotifications.mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    expect(await screen.findByText('Notifications could not be loaded.')).toBeInTheDocument();

    listNotifications.mockResolvedValue(page());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('button', { name: 'Source scan finished — mark as read' }),
    ).toBeInTheDocument();
  });

  it('renders each row as title + description, from the KIND rather than server prose', async () => {
    // The API sends no message text (ADR-0064), so this is what proves the client turns a kind into
    // a sentence — and that it does so through the i18n catalog.
    listNotifications.mockResolvedValue(
      page({
        notifications: [
          notification(),
          notification({ id: 'ntf-2', kind: 'scan.failed', severity: 'error' }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    const list = await screen.findByRole('list', { name: 'Recent notifications' });
    expect(list).toHaveTextContent('Source scan finished');
    expect(list).toHaveTextContent('New and changed content is indexed and searchable.');
    expect(list).toHaveTextContent('Source scan failed');
    expect(list).toHaveTextContent('Indexing stopped before finishing; open Sources for detail.');
  });

  it('counts unread from the SERVER, not from what happens to be on this device (F-065)', async () => {
    listNotifications.mockResolvedValue(
      page({
        notifications: [notification(), notification({ id: 'ntf-2', read: true })],
        unreadCount: 1,
      }),
    );
    const user = userEvent.setup();
    renderHeader();

    // The badge is the server's number — the same one a phone signed in as this principal shows.
    expect(await screen.findByTestId('notifications-badge')).toHaveTextContent('1');

    // …and per-row, `read` comes from the server too rather than from a local mark.
    await openBell(user);
    await waitFor(() => {
      expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(1);
    });
  });

  it('marks a row read optimistically, so clearing several does not stall on round-trips', async () => {
    listNotifications.mockResolvedValue(page({ notifications: [notification()] }));
    // Never settles: if the dot only cleared on the response, this would hang and the test fail.
    markNotificationsRead.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    await user.click(
      await screen.findByRole('button', { name: 'Source scan finished — mark as read' }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-dot')).not.toBeInTheDocument();
    });
    expect(markNotificationsRead).toHaveBeenCalledWith(['ntf-1']);
  });

  it('sends no instant with mark-all-read — the server owns the watermark', async () => {
    listNotifications.mockResolvedValue(page());
    markAllNotificationsRead.mockResolvedValue({ watermark: null, readIds: [], unreadCount: 0 });
    const user = userEvent.setup();
    renderHeader();

    await openBell(user);
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    // A stale panel naming its own instant could mark rows it was never shown.
    await waitFor(() => {
      expect(markAllNotificationsRead).toHaveBeenCalledWith();
    });
  });
});
