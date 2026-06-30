import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { CommandPalette } from '@/components/command-palette';
import { useCommandMenu } from '@/lib/store/command';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
}));

function renderPalette() {
  return render(
    <ThemeProvider attribute="class">
      <CommandPalette />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  useCommandMenu.setState({ open: true });
});

describe('CommandPalette', () => {
  it('lists navigation actions when open', async () => {
    renderPalette();

    expect(await screen.findByPlaceholderText('Search or jump to…')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Knowledge graph')).toBeInTheDocument();
  });

  it('navigates and closes when an action is selected', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(await screen.findByText('Search'));

    expect(push).toHaveBeenCalledWith('/search');
    expect(useCommandMenu.getState().open).toBe(false);
  });
});
