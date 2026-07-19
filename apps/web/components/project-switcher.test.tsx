import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const listProjects = vi.hoisted(() =>
  vi.fn(async () => ({
    projects: [
      { id: 'default', name: 'Default', createdAt: '1970-01-01T00:00:00.000Z', isDefault: true },
      { id: 'proj-1', name: 'Backend', createdAt: '2026-07-06T10:00:00.000Z', isDefault: false },
    ],
  })),
);
const createProject = vi.hoisted(() =>
  vi.fn(async (body: { name: string }) => ({
    id: 'proj-new',
    name: body.name,
    createdAt: '2026-07-06T11:00:00.000Z',
    isDefault: false,
  })),
);

vi.mock('@/lib/api/client', () => ({
  api: { listProjects, createProject },
  TesseraApiError: class extends Error {
    status = 0;
  },
}));

import { ProjectSwitcher } from '@/components/project-switcher';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useProjectStore, DEFAULT_PROJECT_ID } from '@/lib/store/project';

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>{ui}</SidebarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useProjectStore.setState({ selectedProjectId: DEFAULT_PROJECT_ID });
  listProjects.mockClear();
  createProject.mockClear();
});
afterEach(() => {
  useProjectStore.setState({ selectedProjectId: DEFAULT_PROJECT_ID });
});

describe('ProjectSwitcher', () => {
  it('shows the active project and lists the tenant projects, switching on select', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectSwitcher />);

    // The default project is active initially.
    expect(await screen.findByText('Default')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch project' }));
    // Both projects are listed; selecting one updates the persisted selection.
    const backend = await screen.findByRole('menuitem', { name: /Backend/ });
    await user.click(backend);
    expect(useProjectStore.getState().selectedProjectId).toBe('proj-1');
  });

  it('offers "New project" that opens the create dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectSwitcher />);
    await user.click(screen.getByRole('button', { name: 'Switch project' }));
    await user.click(await screen.findByRole('menuitem', { name: /New project/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('New project');
  });
});

describe('CreateProjectDialog', () => {
  it('gates submit on a non-empty name, creates the project, and switches to it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(<CreateProjectDialog open onOpenChange={onOpenChange} />);

    const submit = screen.getByRole('button', { name: 'Create project' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Name'), 'Payments');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: 'Payments' }));
    await waitFor(() => expect(useProjectStore.getState().selectedProjectId).toBe('proj-new'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
