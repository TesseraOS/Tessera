import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const copyToClipboard = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/lib/clipboard', () => ({ copyToClipboard }));

import { RowContextMenu } from '@/components/row-context-menu';

/** Right-click the row and wait for the menu. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('row') });
  return screen.findByRole('menu');
}

describe('RowContextMenu (F-064; FR-49)', () => {
  it('copies the reference', async () => {
    const user = userEvent.setup();
    render(
      <RowContextMenu reference="doc:src/auth.ts" referenceLabel="ref">
        <div data-testid="row">a row</div>
      </RowContextMenu>,
    );

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /copy ref/i }));

    expect(copyToClipboard).toHaveBeenCalledWith('doc:src/auth.ts', 'Copied ref');
  });

  it('invokes open and show-effects with the row’s own handlers', async () => {
    const onOpen = vi.fn();
    const onShowEffects = vi.fn();
    const user = userEvent.setup();
    render(
      <RowContextMenu reference="doc:a" onOpen={onOpen} onShowEffects={onShowEffects}>
        <div data-testid="row">a row</div>
      </RowContextMenu>,
    );

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledOnce();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Show effects' }));
    expect(onShowEffects).toHaveBeenCalledOnce();
  });

  it('OMITS actions a surface cannot offer, rather than disabling them', async () => {
    const user = userEvent.setup();
    render(
      <RowContextMenu reference="doc:a">
        <div data-testid="row">a row</div>
      </RowContextMenu>,
    );

    await openMenu(user);

    // A greyed-out item teaches "this exists and you are doing it wrong"; absence teaches "this row
    // has nothing to show". Copy survives because every row has a reference.
    expect(screen.queryByRole('menuitem', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Show effects' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /copy/i })).toBeInTheDocument();
  });

  // The KEYBOARD does not open this menu at all — see tests/e2e/row-context-menu.spec.ts, which
  // pins that in a real browser and pins the keyboard-reachable alternative alongside it. jsdom
  // cannot judge either way: it never turns Shift+F10 into a `contextmenu` event, so a test here
  // would "pass" for the wrong reason.
});
