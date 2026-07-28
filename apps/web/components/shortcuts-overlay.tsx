'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { t } from '@/lib/i18n';
import { SHORTCUT_GROUPS, isShortcutsOverlayShortcut } from '@/lib/shortcuts';

/**
 * The keyboard-shortcuts help overlay (F-064; FR-49), opened with `?`.
 *
 * It renders {@link SHORTCUT_GROUPS} rather than its own list, so the catalog has exactly one
 * definition. Grouping carries the **scope** as well as the keys: a user who presses ↓ on the
 * Settings page and sees nothing happen deserves to be told those keys belong to the results list,
 * rather than concluding the shortcut is broken.
 */
export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutsOverlayShortcut(event, event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>
            Press <Keycap>?</Keycap> anywhere to bring this back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-medium">{group.title}</h3>
                <p className="text-muted-foreground text-xs">{group.scope}</p>
              </div>
              <dl className="divide-border/60 divide-y">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between gap-4 py-1.5"
                  >
                    <dt className="text-muted-foreground text-xs">{shortcut.description}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <Keycap key={key}>{key}</Keycap>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Keycap({ children }: { children: string }) {
  return (
    <kbd className="bg-muted text-muted-foreground border-border inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-[10px]">
      {children}
    </kbd>
  );
}
