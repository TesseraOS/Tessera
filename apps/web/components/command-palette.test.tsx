import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { CommandPalette, PRIMARY_ACTIONS, isPaletteShortcut } from '@/components/command-palette';
import { useCommandMenu } from '@/lib/store/command';
import { useQuickAction } from '@/lib/store/quick-action';

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

describe('primary actions (F-064; FR-49)', () => {
  beforeEach(() => {
    useQuickAction.setState({ pending: null });
    useCommandMenu.setState({ open: true });
  });

  it('offers every declared route action', async () => {
    renderPalette();

    // Derived from the table, so adding an entry without an item — or vice versa — fails here rather
    // than being noticed by a user who cannot find the action.
    for (const { label } of PRIMARY_ACTIONS) {
      expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('option', { name: 'Compile context' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'New project' })).toBeInTheDocument();
  });

  it('leaves a request for the destination view AND navigates there', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(await screen.findByRole('option', { name: 'Capture memory' }));

    // Both halves matter: navigation alone lands the user on /memory with nothing open, and the
    // request alone never gets read because the view is not mounted.
    expect(push).toHaveBeenCalledWith('/memory');
    expect(useQuickAction.getState().pending).toBe('capture-memory');
  });

  it('routes each action to its own view', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(await screen.findByRole('option', { name: 'Add source' }));

    expect(push).toHaveBeenCalledWith('/sources');
    expect(useQuickAction.getState().pending).toBe('add-source');
  });

  it('compiling is navigation only — it opens no dialog, because Compile spends budget', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(await screen.findByRole('option', { name: 'Compile context' }));

    expect(push).toHaveBeenCalledWith('/inspector');
    expect(useQuickAction.getState().pending).toBeNull();
  });
});
