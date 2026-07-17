'use client';

import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The virtualized data-table pattern (F-063; FR-49).
 *
 * **Why this is not a `<table>`, and not `@tanstack/react-table`.**
 *
 * *Not a `<table>`*: virtualization needs absolutely-positioned rows at computed offsets, and
 * `position: absolute` on a `<tr>` removes it from the table row-box algorithm, so columns stop
 * aligning. The usual workaround — `display: block` on table/tbody/tr — strips the implicit ARIA
 * roles browsers derive from those tags. Either way the semantics are gone, so we declare them
 * explicitly instead. `components/ui/table.tsx` stays the right tool for small static tables, where a
 * real `<table>` gives native semantics and no ARIA to get wrong.
 *
 * *Not react-table*: it is headless — it renders no DOM and no ARIA, so the hard part below is ours
 * either way. Its value is row models for sorting, filtering and pagination, and on a
 * server-filtered, server-paginated, cursor-ordered surface every one of those is bypassed. What
 * would remain is a declarative column array, i.e. a dependency for `.map()`.
 */

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  /** A CSS grid track (e.g. `'190px'`, `'1fr'`, `'minmax(0,2fr)'`). */
  readonly width: string;
  readonly cell: (row: T) => ReactNode;
  /** Right-align (numbers, status). */
  readonly align?: 'end';
  /**
   * Truncate with a tooltip carrying the full value. Requires `text` so the tooltip has something to
   * show that is not a React tree.
   */
  readonly truncate?: (row: T) => string;
}

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** Accessible name for the grid. */
  readonly label: string;
  readonly busy?: boolean;
  readonly estimateRowHeight?: number;
  readonly maxHeightClass?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  busy = false,
  estimateRowHeight = 44,
  maxHeightClass = 'max-h-[60vh]',
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 12,
  });

  const template = columns.map((column) => column.width).join(' ');

  return (
    // The `role="table"` element IS the scroll container. A plain <div> between it and the rowgroups
    // would break axe's aria-required-children/aria-required-parent — and it is also what makes the
    // header's `sticky top-0` work. The clean ownership chain and the sticky header are one structure.
    <div
      ref={scrollRef}
      role="table"
      aria-label={label}
      // -1 means "total unknown", which is the truth under cursor pagination: `AuditPage` is
      // `{events, nextCursor?}` — no count exists anywhere in the model, schema or adapters. Putting
      // the LOADED count here would announce "row 50 of 50" while `nextCursor` proves otherwise: the
      // "narrow the filters" lie, whispered to the users least able to detect it.
      aria-rowcount={-1}
      aria-busy={busy}
      className={cn('overflow-y-auto rounded-xl', maxHeightClass)}
    >
      <div role="rowgroup" className="bg-sidebar sticky top-0 z-10">
        <div
          role="row"
          aria-rowindex={1}
          className="border-border/60 grid items-center gap-3 border-b px-3 py-2"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className={cn(
                'text-muted-foreground truncate text-xs font-medium',
                column.align === 'end' && 'text-right',
              )}
            >
              {column.header}
            </div>
          ))}
        </div>
      </div>

      {/* The virtualizer's height spacer IS the body rowgroup, so rows are DIRECT children of a
          rowgroup — no role="presentation" gymnastics, no aria-owns. */}
      <div
        role="rowgroup"
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (row === undefined) return null;
          return (
            <div
              key={rowKey(row)}
              data-index={item.index}
              ref={virtualizer.measureElement}
              role="row"
              // ABSOLUTE index in the full set, +2 for the 1-based header row. Window-relative
              // indices (1..10, repeating) are invisible to axe and completely broken for AT.
              aria-rowindex={item.index + 2}
              className="border-border/40 absolute top-0 left-0 grid w-full items-center gap-3 border-b px-3 py-2"
              style={{ gridTemplateColumns: template, transform: `translateY(${item.start}px)` }}
            >
              {columns.map((column) => (
                <Cell key={column.key} column={column} row={row} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell<T>({ column, row }: { column: DataTableColumn<T>; row: T }) {
  const content = (
    <div
      role="cell"
      className={cn('min-w-0 truncate text-xs', column.align === 'end' && 'text-right')}
    >
      {column.cell(row)}
    </div>
  );

  const full = column.truncate?.(row);
  if (full === undefined || full.length === 0) return content;

  return (
    <Tooltip>
      {/* asChild so the trigger IS the cell — a wrapper here would sit between role="row" and
          role="cell" and break the required-children chain. */}
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="max-w-md font-mono text-[10px] break-all">{full}</TooltipContent>
    </Tooltip>
  );
}
