import { describe, expect, it } from 'vitest';
import { isPaletteShortcut } from '@/components/command-palette';
import { SHORTCUT_GROUPS, isShortcutsOverlayShortcut } from '@/lib/shortcuts';

const allShortcuts = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);

describe('the shortcut catalog (F-064; FR-49)', () => {
  it('agrees with the palette about ⌘K — the one binding it can check automatically', () => {
    const documented = allShortcuts.find((s) => s.keys.join('') === '⌘K');
    expect(documented?.description).toMatch(/command palette/i);

    // The catalog is a declaration; this asserts the declaration matches the predicate the palette
    // actually runs, so the overlay cannot advertise a keystroke the app ignores.
    expect(isPaletteShortcut({ key: 'k', metaKey: true, ctrlKey: false, isComposing: false })).toBe(
      true,
    );
    expect(isPaletteShortcut({ key: 'k', metaKey: false, ctrlKey: true, isComposing: false })).toBe(
      true,
    );
  });

  it('documents every shortcut exactly once, with keys and a description', () => {
    const descriptions = allShortcuts.map((s) => s.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const shortcut of allShortcuts) {
      expect(shortcut.keys.length).toBeGreaterThan(0);
      expect(shortcut.description.length).toBeGreaterThan(0);
    }
  });

  it('gives every group a scope, so a key that does nothing here is explainable', () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.scope.length).toBeGreaterThan(0);
      expect(group.shortcuts.length).toBeGreaterThan(0);
    }
  });
});

describe('isShortcutsOverlayShortcut', () => {
  const bare = { key: '?', metaKey: false, ctrlKey: false, altKey: false };

  it('opens on a bare ?', () => {
    expect(isShortcutsOverlayShortcut(bare, null)).toBe(true);
  });

  it('does NOT fire while the user is typing', () => {
    // The whole reason for the guard: `?` is a printable character, so without this it would open a
    // dialog mid-word in the search box.
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isShortcutsOverlayShortcut(bare, document.createElement(tag))).toBe(false);
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not implement isContentEditable from the attribute; assert the property directly.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isShortcutsOverlayShortcut(bare, editable)).toBe(false);
  });

  it('ignores modified ? and every other key', () => {
    expect(isShortcutsOverlayShortcut({ ...bare, metaKey: true }, null)).toBe(false);
    expect(isShortcutsOverlayShortcut({ ...bare, ctrlKey: true }, null)).toBe(false);
    expect(isShortcutsOverlayShortcut({ ...bare, altKey: true }, null)).toBe(false);
    expect(isShortcutsOverlayShortcut({ ...bare, key: '/' }, null)).toBe(false);
  });

  it('treats a non-element target as safe rather than throwing', () => {
    expect(isShortcutsOverlayShortcut(bare, new EventTarget())).toBe(true);
  });
});
