import { cx } from '@/lib/format';
import type { ReactNode } from 'react';

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Table<T>({ rows, cols, empty = 'Nothing here yet', onRow }: { rows: T[]; cols: { key: string; label: string; render?: (r: T) => ReactNode; className?: string }[]; empty?: string; onRow?: (r: T) => void }) {
  if (!rows.length) return <div className="rounded-lg border border-dashed border-line p-10 text-center text-sm text-muted">{empty}</div>;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted"><tr>{cols.map((c) => <th key={c.key} className={cx('px-3 py-2 font-medium', c.className)}>{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-line bg-surface">
          {rows.map((r, i) => (
            <tr key={(r as any).id ?? i} onClick={onRow ? () => onRow(r) : undefined} className={cx(onRow && 'cursor-pointer hover:bg-canvas')}>
              {cols.map((c) => <td key={c.key} className={cx('px-3 py-2', c.className)}>{c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-10 text-center"><p className="font-medium">{title}</p>{children && <div className="mt-2 text-sm text-muted">{children}</div>}</div>;
}
