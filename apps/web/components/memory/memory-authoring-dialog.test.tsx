import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const captureMemory = vi.hoisted(() => vi.fn(async () => ({ id: 'm1', title: 'T', version: 1 })));
const editMemory = vi.hoisted(() => vi.fn(async () => ({ id: 'm2', title: 'T2', version: 2 })));

vi.mock('@/lib/api/client', () => ({
  api: { captureMemory, editMemory },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// Monaco → a controlled textarea so validation + submit are exercised without loading the editor.
vi.mock('@/components/memory/memory-editor', () => ({
  MemoryEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
  }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { MemoryAuthoringDialog } from '@/components/memory/memory-authoring-dialog';
import type { Memory } from '@/lib/api/types';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('MemoryAuthoringDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gates capture on title + body and calls captureMemory', async () => {
    const user = userEvent.setup();
    renderWithClient(<MemoryAuthoringDialog open onOpenChange={vi.fn()} />);

    const submit = screen.getByRole('button', { name: 'Capture memory' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), 'Chose Fastify');
    await user.type(screen.getByLabelText('Memory body (markdown)'), 'Because it is fast.');
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() =>
      expect(captureMemory).toHaveBeenCalledWith({
        kind: 'decision',
        title: 'Chose Fastify',
        body: 'Because it is fast.',
      }),
    );
  });

  it('prefills in edit mode and calls editMemory (appends a version)', async () => {
    const user = userEvent.setup();
    const editing: Memory = {
      id: 'm1',
      lineageId: 'l1',
      kind: 'lesson',
      title: 'Original title',
      body: 'Original body',
      scope: 'api',
      confidence: 1,
      metadata: {},
      version: 1,
      supersedes: null,
      supersededBy: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    };

    renderWithClient(<MemoryAuthoringDialog open onOpenChange={vi.fn()} editing={editing} />);

    expect(screen.getByDisplayValue('Original title')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save new version' });

    await user.click(save);
    await waitFor(() =>
      expect(editMemory).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({ title: 'Original title', body: 'Original body' }),
      ),
    );
  });
});
