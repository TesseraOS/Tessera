'use client';

import { Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { useCommandMenu } from '@/lib/store/command';

/** Top bar: mobile nav trigger, command-palette search, theme toggle, account. */
export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const setOpen = useCommandMenu((state) => state.setOpen);

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
      >
        <Menu className="size-4" />
      </Button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="text-muted-foreground bg-muted/50 hover:bg-muted ring-offset-background focus-visible:ring-ring inline-flex h-9 w-full max-w-xs items-center gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:max-w-sm"
      >
        <Search className="size-4" />
        <span>Search…</span>
        <kbd className="bg-background ml-auto hidden rounded border px-1.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
