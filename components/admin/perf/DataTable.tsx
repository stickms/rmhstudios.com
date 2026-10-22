import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  id: string;
  /** Already-translated header text. */
  header: string;
  render: (row: T) => ReactNode;
  /** Present => the column is sortable by this value. */
  sortValue?: (row: T) => number | string;
  align?: 'left' | 'right';
  /** Extra classes for the body cell, per row (tone colouring). */
  cellClass?: (row: T) => string | undefined;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { id: string; dir: 'asc' | 'desc' };
  /** Cap on rendered rows (sorting still sees all of them). */
  limit?: number;
  empty: string;
  /** Already-translated names for the sort buttons' accessible label. */
  sortLabel: (header: string) => string;
}

/**
 * A sortable table inside a horizontal scroller, so a wide table scrolls on a
 * phone instead of widening the page. Headers of sortable columns are buttons
 * carrying `aria-sort` on the `<th>`.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  limit = 200,
  empty,
  sortLabel,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }, [rows, columns, sort]);

  if (rows.length === 0) {
    return (
      <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
        {empty}
      </p>
    );
  }

  return (
    <div className="glass-fill overflow-x-auto rounded-site">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.id === c.id;
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'px-3 py-2 text-xs font-semibold text-site-text-muted',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      aria-label={sortLabel(c.header)}
                      onClick={() =>
                        setSort(
                          active && sort.dir === 'desc'
                            ? { id: c.id, dir: 'asc' }
                            : { id: c.id, dir: 'desc' },
                        )
                      }
                      className={cn(
                        'inline-flex items-center gap-1 rounded-site hover:text-site-text',
                        active && 'text-site-text',
                      )}
                    >
                      {c.header}
                      {active &&
                        (sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        ))}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((row) => (
            <tr key={rowKey(row)} className="border-t border-site-border">
              {columns.map((c) => (
                <td
                  key={c.id}
                  className={cn(
                    'px-3 py-2 tabular-nums text-site-text',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.cellClass?.(row),
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
