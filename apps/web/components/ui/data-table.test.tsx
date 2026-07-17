import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

// jsdom has no layout, so the real virtualizer measures a 0-height viewport and renders nothing.
// Stub it to render a WINDOW (not everything), so the aria-rowindex assertions below are meaningful:
// with every row rendered, a window-relative bug would be indistinguishable from a correct absolute
// index. Real virtualization is verified in e2e + screenshots.
const window_ = vi.hoisted(() => ({ start: 0, size: 10 }));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 44,
    getVirtualItems: () =>
      Array.from({ length: Math.min(window_.size, count - window_.start) }, (_, i) => {
        const index = window_.start + i;
        return { index, key: index, start: index * 44 };
      }),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

/** A synthetic row type — the primitive must know nothing about audit. */
interface Widget {
  id: string;
  name: string;
  detail: string;
  count: number;
}

const columns: DataTableColumn<Widget>[] = [
  { key: 'name', header: 'Name', width: '1fr', cell: (w) => w.name },
  {
    key: 'detail',
    header: 'Detail',
    width: '2fr',
    cell: (w) => w.detail,
    truncate: (w) => w.detail,
  },
  { key: 'count', header: 'Count', width: '80px', align: 'end', cell: (w) => w.count },
];

const widgets = (n: number): Widget[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    name: `widget-${i}`,
    detail: `detail-${i}`,
    count: i,
  }));

function renderTable(rows: Widget[]) {
  return render(<DataTable columns={columns} rows={rows} rowKey={(w) => w.id} label="Widgets" />);
}

describe('DataTable', () => {
  it('declares grid semantics explicitly, since a virtualized table cannot be a <table>', () => {
    window_.start = 0;
    renderTable(widgets(3));

    const table = screen.getByRole('table', { name: 'Widgets' });
    expect(table).toBeInTheDocument();
    // Header rowgroup + body rowgroup, both DIRECT children of role=table — anything between them
    // breaks aria-required-children/parent.
    expect(within(table).getAllByRole('rowgroup')).toHaveLength(2);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Detail', 'Count']);
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3
  });

  it('reports aria-rowcount as -1 — the total is genuinely unknown under cursor pagination', () => {
    window_.start = 0;
    renderTable(widgets(3));

    // Announcing the LOADED count would say "row 3 of 3" while more pages exist: the "narrow the
    // filters" lie, told to the users least able to detect it. -1 is ARIA's "unknown".
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '-1');
  });

  it('gives rows their ABSOLUTE index, not their index within the rendered window', () => {
    // Scrolled to row 60. This is the assertion axe CANNOT make: a window-relative index (1..10
    // repeating) is structurally valid ARIA and completely broken for a screen reader.
    window_.start = 60;
    renderTable(widgets(200));

    const rows = screen.getAllByRole('row').slice(1); // drop the header
    expect(rows[0]).toHaveAttribute('aria-rowindex', '62'); // 60 + 1 header + 1 (ARIA is 1-based)
    expect(rows[9]).toHaveAttribute('aria-rowindex', '71');
    expect(rows[0]).toHaveTextContent('widget-60');
  });

  it('numbers the header row 1', () => {
    window_.start = 0;
    renderTable(widgets(2));
    expect(screen.getAllByRole('row')[0]).toHaveAttribute('aria-rowindex', '1');
  });

  it('renders a header and no orphan rows when there is no data', () => {
    window_.start = 0;
    renderTable([]);

    const table = screen.getByRole('table');
    // An empty grid is where F-061 shipped a critical violation: the structure must stay valid with
    // zero rows — a rowgroup with no row children is an aria-required-children candidate.
    expect(within(table).getAllByRole('rowgroup')).toHaveLength(2);
    expect(within(table).getAllByRole('row')).toHaveLength(1); // the header alone
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
  });

  it('renders every cell through its column, in order', () => {
    window_.start = 0;
    renderTable(widgets(1));

    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveTextContent('widget-0');
    expect(cells[2]).toHaveTextContent('0');
  });

  it('marks itself busy while refetching', () => {
    window_.start = 0;
    render(
      <DataTable columns={columns} rows={widgets(1)} rowKey={(w) => w.id} label="Widgets" busy />,
    );
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('knows nothing about audit — the row type is the caller business', () => {
    // Genericity by construction: the primitive is typed over T and this test never imports an audit
    // type. A "reusable pattern" with one real consumer is otherwise unproven.
    window_.start = 0;
    renderTable(widgets(2));
    expect(screen.getByRole('table', { name: 'Widgets' })).toBeInTheDocument();
  });
});
