import { t } from '@/lib/i18n';

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
    title: t('shortcuts.group.global'),
    scope: t('shortcuts.group.global.scope'),
    shortcuts: [
      { keys: ['⌘', 'K'], description: t('shortcuts.palette') },
      { keys: ['⌘', 'B'], description: t('shortcuts.sidebar') },
      { keys: ['?'], description: t('shortcuts.help') },
      { keys: ['Esc'], description: t('shortcuts.dismiss') },
    ],
  },
  {
    title: t('shortcuts.group.search'),
    scope: t('shortcuts.group.search.scope'),
    shortcuts: [
      { keys: ['↓'], description: t('shortcuts.next') },
      { keys: ['↑'], description: t('shortcuts.previous') },
      { keys: ['Home'], description: t('shortcuts.first') },
      { keys: ['End'], description: t('shortcuts.last') },
      { keys: ['Enter'], description: t('shortcuts.open') },
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
