import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { ThemeToggle } from '@/components/theme-toggle';

function renderWithTheme(ui: ReactNode) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {ui}
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  it('opens the menu and applies the dark theme', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /change theme/i }));
    const darkItem = await screen.findByRole('menuitem', { name: /dark/i });
    await user.click(darkItem);

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });
});
