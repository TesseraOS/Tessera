import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getNotificationPreferences = vi.hoisted(() => vi.fn());
const updateNotificationPreferences = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getNotificationPreferences, updateNotificationPreferences },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

import { NotificationSettings } from '@/components/settings/notification-settings';

const ALL_ON = {
  'memory.captured': true,
  'scan.completed': true,
  'scan.failed': true,
  'token.changed': true,
  'plan.changed': true,
};

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationSettings />
    </QueryClientProvider>,
  );
}

describe('NotificationSettings (F-065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a switch for every kind, named by the kind rather than "Toggle"', async () => {
    getNotificationPreferences.mockResolvedValue({ preferences: ALL_ON });
    renderCard();

    // A row of five switches all called the same thing is unusable with a screen reader.
    for (const name of [
      'Source scan failed',
      'Source scan finished',
      'Memory captured',
      'API token changed',
      'Plan changed',
    ]) {
      expect(await screen.findByRole('switch', { name })).toBeChecked();
    }
  });

  it('sends a PARTIAL update — only the kind that changed', async () => {
    getNotificationPreferences.mockResolvedValue({ preferences: ALL_ON });
    updateNotificationPreferences.mockResolvedValue({
      preferences: { ...ALL_ON, 'plan.changed': false },
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('switch', { name: 'Plan changed' }));

    // A full record would let a client built before a kind existed mute it by omission.
    await waitFor(() => {
      expect(updateNotificationPreferences).toHaveBeenCalledWith({ 'plan.changed': false });
    });
  });

  it('reflects the SERVER’s answer, not the click', async () => {
    // Nothing is written locally: the query is the source of truth, so a rejected save leaves the
    // switch where the server says it is rather than where the user last pressed it.
    getNotificationPreferences.mockResolvedValue({
      preferences: { ...ALL_ON, 'scan.failed': false },
    });
    updateNotificationPreferences.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    renderCard();

    const failedSwitch = await screen.findByRole('switch', { name: 'Source scan failed' });
    expect(failedSwitch).not.toBeChecked();

    await user.click(failedSwitch);
    expect(await screen.findByText('That change could not be saved. Try again.')).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Source scan failed' })).not.toBeChecked();
  });

  it('states a load failure instead of rendering switches that control nothing', async () => {
    getNotificationPreferences.mockRejectedValue(new Error('down'));
    renderCard();

    expect(
      await screen.findByText('Notification preferences could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });
});
