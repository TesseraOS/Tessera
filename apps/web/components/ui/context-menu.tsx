'use client';

import type { ComponentProps } from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';

/**
 * Right-click menu for data rows (F-064; FR-49), styled to match `ui/dropdown-menu` so the two are
 * indistinguishable once open — a user should not be able to tell which gesture produced the menu.
 *
 * **This menu is a shortcut, never the only path to an action.** Radix gives it right-click and
 * long-press; it does NOT give it the keyboard here, and that was measured rather than assumed. On
 * the search results the listbox holds focus via `aria-activedescendant`, so Shift+F10 and the Menu
 * key fire `contextmenu` on the LISTBOX and never reach a row trigger — both were driven in Chromium
 * and opened nothing. Making rows individually focusable would mean replacing the roving-focus model
 * the list already has.
 *
 * So every action offered here must also exist somewhere a keyboard can reach, or it is a WCAG 2.1.1
 * failure dressed up as a convenience. Copy ref, for instance, is also a button in the result detail.
 */

function ContextMenu({
  modal = false,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Root>) {
  // `modal={false}`, against Radix's default. In modal mode Radix marks the rest of the page
  // `aria-hidden` while the menu is open, and every focusable element left inside that subtree trips
  // axe's `aria-hidden-focus` — 196 violations on the search page, all of them the app's own chrome.
  // A row menu is not a modal: nothing behind it needs to be sealed off, and not sealing it also
  // leaves background scrolling alone, which is what a user expects from a right-click menu.
  return <ContextMenuPrimitive.Root data-slot="context-menu" modal={modal} {...props} />;
}

function ContextMenuTrigger({ ...props }: ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-(--radix-context-menu-content-available-height) min-w-[10rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        'text-muted-foreground px-2 py-1.5 text-xs font-medium data-[inset]:pl-8',
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
};
