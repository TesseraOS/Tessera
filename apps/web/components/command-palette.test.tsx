import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { CommandPalette, isPaletteShortcut } from '@/components/command-palette';
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

  it('opens on the real shortcut', () => {
    useCommandMenu.setState({ open: false });
    renderPalette();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, bubbles: true }),
    );

    expect(useCommandMenu.getState().open).toBe(true);
  });
});

/**
 * F-079. The listener is bound to `document`, so it sees every keydown on the page — including ones
 * the palette has no business reading, some of which carry no `key` at all.
 *
 * Tested through the pure predicate rather than by dispatching: an exception thrown inside a
 * listener is swallowed by `dispatchEvent` (it surfaces as an *uncaught* error, which a runner may
 * attribute to whichever test is running next), so `expect(dispatch).not.toThrow()` would pass even
 * while the handler threw. Asserting the decision directly is the honest test.
 */
describe('isPaletteShortcut', () => {
  const event = (over: Partial<KeyboardEvent>) =>
    ({ key: 'k', metaKey: false, ctrlKey: false, isComposing: false, ...over }) as KeyboardEvent;

  it('accepts ctrl-k and meta-k, in either case', () => {
    expect(isPaletteShortcut(event({ ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(event({ metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(event({ key: 'K', metaKey: true }))).toBe(true);
  });

  it('rejects a keydown with no key at all (autofill / password managers) instead of throwing', () => {
    // The reported crash: `Cannot read properties of undefined (reading 'toLowerCase')`.
    const undefinedKey = { metaKey: false, ctrlKey: true, isComposing: false } as KeyboardEvent;
    expect(() => isPaletteShortcut(undefinedKey)).not.toThrow();
    expect(isPaletteShortcut(undefinedKey)).toBe(false);
  });

  it('rejects a "k" mid-IME-composition — that is text the user is typing', () => {
    expect(isPaletteShortcut(event({ ctrlKey: true, isComposing: true }))).toBe(false);
  });

  it('rejects k without a modifier, and other modified keys', () => {
    expect(isPaletteShortcut(event({}))).toBe(false);
    expect(isPaletteShortcut(event({ key: 'j', ctrlKey: true }))).toBe(false);
  });
});
