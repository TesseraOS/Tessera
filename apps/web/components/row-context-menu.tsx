'use client';

import type { ReactNode } from 'react';
import { Copy, ExternalLink, Share2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { copyToClipboard } from '@/lib/clipboard';
import { t } from '@/lib/i18n';

export interface RowContextMenuProps {
  /** The stable identifier this row is about — a search ref, a memory lineage, an audit target. */
  readonly reference: string;
  /** What the copied value is called in the menu and in the toast, e.g. `ref`, `lineage`. */
  readonly referenceLabel?: string;
  /** Open the row's own surface. Omitted ⇒ the item is not rendered. */
  readonly onOpen?: () => void;
  /** Show what this row affects in the knowledge graph. Omitted ⇒ the item is not rendered. */
  readonly onShowEffects?: () => void;
  readonly children: ReactNode;
}

/**
 * The right-click menu shared by every data row (F-064; FR-49) — copy the reference, open the row,
 * show its effects.
 *
 * **One component rather than a menu per surface**, because the FR-49 promise is that a row behaves
 * the same way everywhere; four hand-rolled menus is how three of them end up with different
 * wording and the fourth silently loses an action.
 *
 * Actions are **omitted, never disabled**, when a surface cannot offer them. A greyed-out item
 * teaches a user that the feature exists and they are doing something wrong; absence teaches them the
 * row simply has no effects to show. Copy is always present — every row has a reference, which is
 * why `reference` is required rather than optional.
 */
export function RowContextMenu({
  reference,
  referenceLabel = 'reference',
  onOpen,
  onShowEffects,
  children,
}: RowContextMenuProps) {
  return (
    <ContextMenu>
      {/* asChild so the trigger IS the row — a wrapper element here would sit inside the virtualized
          list and break the row geometry the virtualizer measures. */}
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-xs truncate font-mono">{reference}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            void copyToClipboard(reference, t('row.copied', { label: referenceLabel }));
          }}
        >
          <Copy aria-hidden="true" />
          {t('row.copy', { label: referenceLabel })}
        </ContextMenuItem>
        {onOpen ? (
          <ContextMenuItem onSelect={onOpen}>
            <ExternalLink aria-hidden="true" />
            {t('row.open')}
          </ContextMenuItem>
        ) : null}
        {onShowEffects ? (
          <ContextMenuItem onSelect={onShowEffects}>
            <Share2 aria-hidden="true" />
            {t('row.showEffects')}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
