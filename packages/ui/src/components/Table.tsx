import type { ReactNode } from 'react';
import { cn, focusRing } from '../cn.js';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface TableProps<T> {
  /** Nhãn cho vùng cuộn và bảng (trình đọc màn hình). */
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  caption?: ReactNode;
}

/** Bảng rộng cuộn ngang trong vùng riêng; trang không tràn ngang. Vùng cuộn nhận focus để cuộn bằng bàn phím. */
export function Table<T>({ label, columns, rows, rowKey, empty, caption }: TableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn('ui-table w-full overflow-x-auto rounded-lg border border-line', focusRing)}
    >
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        {caption && <caption className="px-4 py-3 text-left text-xs text-ink-muted">{caption}</caption>}
        <thead className="bg-surface-2/70 text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('px-4 py-3 font-semibold', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-line/70 hover:bg-surface-2/40">
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle text-ink', c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
