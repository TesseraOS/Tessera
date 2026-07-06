import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const registerSource = vi.hoisted(() =>
  vi.fn(async (body: { kind: string; config: { root: string }; label?: string }) => ({
    id: 'src-1',
    kind: body.kind,
    label: body.label ?? body.config.root,
    config: body.config,
    createdAt: '2026-07-06T10:00:00.000Z',
  })),
);

vi.mock('@/lib/api/client', () => ({
  api: { registerSource },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

import { RegisterSourceDialog } from '@/components/sources/register-source-dialog';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RegisterSourceDialog', () => {
  it('gates submit on a non-empty path and registers the source', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithClient(<RegisterSourceDialog open onOpenChange={onOpenChange} />);

    const submit = screen.getByRole('button', { name: 'Register source' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Directory path'), '/repo');
    expect(submit).toBeEnabled();

    await user.click(submit);

    await waitFor(() =>
      expect(registerSource).toHaveBeenCalledWith({
        kind: 'filesystem',
        config: { root: '/repo' },
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('offers GitHub as an explicitly disabled (not-yet-available) option', () => {
    renderWithClient(<RegisterSourceDialog open onOpenChange={vi.fn()} />);

    // Radix Select mirrors options into a hidden native <select> (in the dialog portal on
    // document.body); the GitHub option is disabled — honest, not a form that 400s.
    const githubOption = document.querySelector('option[value="github"]');
    expect(githubOption).not.toBeNull();
    expect(githubOption).toBeDisabled();
  });
});
