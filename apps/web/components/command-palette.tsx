'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
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

/** Global ⌘K / Ctrl-K command palette (UX baseline, FR-49). */
export function CommandPalette() {
  const { open, setOpen, toggle } = useCommandMenu();
  const router = useRouter();
  const { setTheme } = useTheme();

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
          <CommandItem value="Light theme" onSelect={() => run(() => setTheme('light'))}>
            <Sun />
            Light
          </CommandItem>
          <CommandItem value="Dark theme" onSelect={() => run(() => setTheme('dark'))}>
            <Moon />
            Dark
          </CommandItem>
          <CommandItem value="System theme" onSelect={() => run(() => setTheme('system'))}>
            <Monitor />
            System
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
