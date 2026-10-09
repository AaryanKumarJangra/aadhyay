'use client';
import { useState, type ReactNode } from 'react';
import { BarChart3, Download, Table2 } from 'lucide-react';
import { cx } from '@/lib/format';
import { EmptyState } from '../ui/feedback';
import { downloadCsv, toCsv } from './scale';

export interface ChartTable { columns: string[]; rows: (string | number | null)[][] }

/**
 * Card for a chart: title, description, Chart/Table toggle (the accessible view of every chart), CSV export,
 * and an explained empty state.
 */
export function ChartCard({ title, description, table, empty, actions, children, className }: {
  title: string; description?: ReactNode; table?: ChartTable; empty?: { title: string; description?: ReactNode; action?: ReactNode } | null; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={cx('flex flex-col rounded-xl border border-line bg-surface shadow-sm', className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {table && !empty && (
            <>
              <button type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} aria-pressed={view === 'table'} title={view === 'chart' ? 'Show as table' : 'Show as chart'} aria-label={view === 'chart' ? 'Show as table' : 'Show as chart'} className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
                {view === 'chart' ? <Table2 className="size-4" /> : <BarChart3 className="size-4" />}
              </button>
              <button type="button" onClick={() => downloadCsv(title, toCsv(table.columns, table.rows))} title="Export CSV" aria-label={`Export ${title} as CSV`} className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
                <Download className="size-4" />
              </button>
            </>
          )}
        </div>
      </header>
      <div className="flex-1 p-5 pt-4">
        {empty ? (
          <EmptyState compact title={empty.title} description={empty.description} action={empty.action} />
        ) : view === 'table' && table ? (
          <div className="max-h-72 overflow-auto scrollbar-thin">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted"><tr>{table.columns.map((c, i) => <th key={c} className={cx('border-b border-line py-2 font-medium', i > 0 && 'text-right')}>{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i} className="border-b border-line/60 last:border-0">{r.map((v, j) => <td key={j} className={cx('py-1.5', j > 0 && 'text-right tabular')}>{v ?? '—'}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
