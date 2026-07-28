/**
 * The keyboard-shortcut catalog (F-064; FR-49) — the single list the help overlay renders.
 *
 * **This is a declaration, not the wiring.** The handlers live where the behaviour lives: the palette
 * owns ⌘K, shadcn's sidebar owns ⌘B, and the search listbox owns its own arrow keys. Rewiring three
 * independent components to dispatch from one table would be a large, risky refactor whose only
 * benefit is this overlay.
 *
 * The risk that creates is drift — a catalog that quietly describes a keystroke nobody implements.
 * `shortcuts.test.ts` closes the part of it that can be closed automatically, by checking the ⌘K
 * entry against `isPaletteShortcut`, the real predicate the palette runs. The rest is held by the
 * e2e, which presses the keys.
 */

export interface Shortcut {
  /** Keys as a user would say them, e.g. `['⌘', 'K']`. Rendered as separate keycaps. */
  readonly keys: readonly string[];
  readonly description: string;
}

export interface ShortcutGroup {
  readonly title: string;
  /** Where these apply — shown so a user knows why a key does nothing on another page. */
  readonly scope: string;
  readonly shortcuts: readonly Shortcut[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Global',
    scope: 'Anywhere in the dashboard',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open the command palette' },
      { keys: ['⌘', 'B'], description: 'Show or hide the sidebar' },
      { keys: ['?'], description: 'Show this list' },
      { keys: ['Esc'], description: 'Close the open dialog, sheet, or menu' },
    ],
  },
  {
    title: 'Search results',
    scope: 'While the results list has focus',
    shortcuts: [
      { keys: ['↓'], description: 'Move to the next result' },
      { keys: ['↑'], description: 'Move to the previous result' },
      { keys: ['Home'], description: 'Jump to the first result' },
      { keys: ['End'], description: 'Jump to the last result' },
      { keys: ['Enter'], description: 'Open the focused result' },
    ],
  },
];

/**
 * Whether a key event should open the shortcuts overlay.
 *
 * `?` only, and only when nothing is being typed into: a bare printable character is a terrible
 * global shortcut if it can fire while the caret sits in the search box. The palette uses ⌘K partly
 * for this reason; `?` is conventional enough to keep, provided the guard below is honest.
 */
export function isShortcutsOverlayShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>,
  target: EventTarget | null,
): boolean {
  if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return false;
  return !isTypingTarget(target);
}

/** Whether the event landed in something the user types into (input, textarea, contenteditable). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
