'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
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
import { useAppearanceTransition } from '@/lib/theme';
import { THEMES, THEME_LABELS } from '@/lib/theme-script';

const MODES = [
  { value: 'light', label: 'Light mode', icon: Sun },
  { value: 'dark', label: 'Dark mode', icon: Moon },
  { value: 'system', label: 'System mode', icon: Monitor },
] as const;

/** Global ⌘K / Ctrl-K command palette (UX baseline, FR-49). */
export function CommandPalette() {
  const { open, setOpen, toggle } = useCommandMenu();
  const router = useRouter();
  const { setAppearance } = useAppearanceTransition();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
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
