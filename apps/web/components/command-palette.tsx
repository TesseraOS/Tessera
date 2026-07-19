'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Monitor, Moon, Palette, Sun } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { navItems } from '@/lib/nav';
import { useCommandMenu } from '@/lib/store/command';
import { useNewProjectDialog } from '@/lib/store/quick-create';
import { useAppearanceTransition } from '@/lib/theme';
import { THEMES, THEME_LABELS } from '@/lib/theme-script';

const MODES = [
  { value: 'light', label: 'Light mode', icon: Sun },
  { value: 'dark', label: 'Dark mode', icon: Moon },
  { value: 'system', label: 'System mode', icon: Monitor },
] as const;

/**
 * Does this keydown mean "open the palette"? Pure, so the decision unit-tests directly rather than
 * through a DOM dispatch — which matters more here than it looks: an exception thrown inside a
 * listener does not propagate out of `dispatchEvent`, so a dispatching test cannot honestly assert
 * "this did not throw".
 *
 * Two guards, both load-bearing (F-079):
 * - **`key` is not guaranteed to be a string.** Keydown synthesised by browser autofill and some
 *   password managers arrives without one. This listener is bound to `document`, so it sees those
 *   events even though they have nothing to do with the palette — and `event.key.toLowerCase()`
 *   threw a TypeError on every one of them.
 * - **A `k` mid-IME-composition is text**, not a shortcut — composing users type it to write.
 */
export function isPaletteShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'isComposing'>,
): boolean {
  if (typeof event.key !== 'string') return false;
  if (event.isComposing) return false;
  return event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
}

/** Global ⌘K / Ctrl-K command palette (UX baseline, FR-49). */
export function CommandPalette() {
  const { open, setOpen, toggle } = useCommandMenu();
  const router = useRouter();
  const { setAppearance } = useAppearanceTransition();
  const openNewProject = useNewProjectDialog((state) => state.setOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPaletteShortcut(event)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="New project" onSelect={() => run(() => openNewProject(true))}>
            <FolderKanban />
            New project
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          {navItems.map(({ title, href, icon: Icon }) => (
            <CommandItem key={href} value={title} onSelect={() => run(() => router.push(href))}>
              <Icon />
              {title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          {THEMES.map((name) => (
            <CommandItem
              key={name}
              value={`${THEME_LABELS[name]} theme`}
              onSelect={() => run(() => setAppearance({ theme: name }))}
            >
              <Palette />
              {THEME_LABELS[name]}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Mode">
          {MODES.map(({ value, label, icon: Icon }) => (
            <CommandItem
              key={value}
              value={label}
              onSelect={() => run(() => setAppearance({ mode: value }))}
            >
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
