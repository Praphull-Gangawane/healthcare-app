import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Render this cell as <th scope="row"> (one per row, usually the identifying column). */
  rowHeader?: boolean;
  numeric?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  caption: string;
  captionHidden?: boolean;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowTestId?: string;
  rowProps?: (row: T) => Record<string, string | undefined>;
  emptyTitle?: string;
  emptyMessage?: ReactNode;
}

/** Accessible data table: caption, column headers with scope, optional row headers. */
export function DataTable<T>({ caption, captionHidden, columns, rows, rowKey, rowTestId, rowProps, emptyTitle = 'Nothing to show', emptyMessage }: DataTableProps<T>) {
  if (!rows.length) {
    return (
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table (scrollable)">
        <EmptyState title={emptyTitle} message={emptyMessage} />
      </div>
    );
  }
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Table (scrollable)">
      <table className="table">
        <caption className={captionHidden ? 'visually-hidden-caption' : undefined}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} data-testid={rowTestId} {...(rowProps?.(row) ?? {})}>
              {columns.map((c) => {
                const cls = [c.numeric ? 'num' : '', c.className ?? ''].filter(Boolean).join(' ') || undefined;
                return c.rowHeader ? (
                  <th key={c.key} scope="row" className={cls}>
                    {c.render(row)}
                  </th>
                ) : (
                  <td key={c.key} className={cls}>
                    {c.render(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
