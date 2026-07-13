import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { AppearanceSwitcher } from '@/components/appearance-switcher';

function renderWithTheme(ui: ReactNode) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {ui}
    </ThemeProvider>,
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

describe('AppearanceSwitcher', () => {
  it('applies a theme (data-theme + persisted) from the picker', async () => {
    const user = userEvent.setup();
    renderWithTheme(<AppearanceSwitcher />);

    await user.click(screen.getByRole('button', { name: /change appearance/i }));
    await user.click(await screen.findByRole('menuitem', { name: /amber/i }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'amber'));
    expect(localStorage.getItem('tessera.theme')).toBe('amber');
  });

  it('applies a mode from the mode segment', async () => {
    const user = userEvent.setup();
    renderWithTheme(<AppearanceSwitcher />);

    await user.click(screen.getByRole('button', { name: /change appearance/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^dark$/i }));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });
});
