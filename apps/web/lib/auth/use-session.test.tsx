import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const me = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({
  api: { me },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {
    constructor(public status: number) {
      super('api error');
    }
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { SessionProvider, useSession } from '@/lib/auth/use-session';
import { useNotificationsRead } from '@/lib/store/notifications';
import { useRecentCompiles } from '@/lib/store/recent-compiles';

function SignOutButton() {
  const { signOut } = useSession();
  return (
    <button type="button" onClick={() => void signOut()}>
      Sign out
    </button>
  );
}

describe('signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    me.mockResolvedValue({
      principal: { id: 'u1', kind: 'user', roles: ['owner'] },
      tenantId: 'acme',
      permissions: [],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    useNotificationsRead.getState().clear();
    useRecentCompiles.getState().clear();
  });

  it('clears the client-held stores so one user never bleeds into the next', async () => {
    // These Zustand stores are not part of TanStack Query's cache, so invalidating queries does not
    // touch them — they would survive into the next sign-in on a shared machine, carrying the
    // previous user's read marks (F-089 persists them per device) and their compile task text
    // (user-authored content).
    useNotificationsRead.getState().markRead('acme:u1', 'evt-1');
    useRecentCompiles
      .getState()
      .remember({ task: 'audit the auth bypass in payments', budget: 2000 });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SignOutButton />
        </SessionProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(useNotificationsRead.getState().byIdentity).toEqual({});
      expect(useRecentCompiles.getState().entries).toEqual([]);
    });
  });
});
