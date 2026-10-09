'use client';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search, type LucideIcon } from 'lucide-react';
import { cx } from '@/lib/format';
import { EmptyState } from './feedback';
import { downloadCsv, toCsv } from '../charts/scale';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell content; defaults to row[key]. */
  cell?: (row: T) => ReactNode;
  /** Plain value for sorting, search and CSV export. */
  value?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right';
  sortable?: boolean;
  /** Hidden by default (user can show it from the column menu). */
  hidden?: boolean;
  /** On phones: 'primary' becomes the card title, 'secondary' the subtitle, 'hide' is dropped; others become label/value rows. */
  mobile?: 'primary' | 'secondary' | 'hide';
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  searchPlaceholder?: string;
  /** Rendered next to the search box (filters). */
  toolbar?: ReactNode;
  /** Shown when rows are selected; receives the selected rows. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  exportName?: string;
  pageSize?: number;
  empty?: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode };
  /** Distinguishes "no data at all" from "no match for the search". */
  label?: string;
}

const plain = <T,>(c: Column<T>, r: T) => (c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number | null | undefined));

export function DataTable<T>({ rows, columns, rowKey, rowHref, searchPlaceholder = 'Search…', toolbar, bulkActions, exportName, pageSize = 25, empty, label = 'records' }: DataTableProps<T>) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.hidden).map((c) => c.key)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [colMenu, setColMenu] = useState(false);
  const visible = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? rows.filter((r) => columns.some((c) => String(plain(c, r) ?? '').toLowerCase().includes(needle))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)!;
      out = [...out].sort((a, b) => {
        const x = plain(col, a), y = plain(col, b);
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en-IN', { numeric: true })) * sort.dir;
      });
    }
    return out;
  }, [rows, columns, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const pageRows = filtered.slice(cur * pageSize, cur * pageSize + pageSize);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)));
  const selRows = rows.filter((r) => selected.has(rowKey(r)));
  const clear = () => setSelected(new Set());
  const toggleSort = (k: string) => setSort((s) => (s?.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }));

  if (!rows.length && empty) return <EmptyState {...empty} />;

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="h-9 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-faint focus:border-brand focus:ring-3 focus:ring-brand/15" />
        </div>
        {toolbar}
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button type="button" onClick={() => setColMenu((v) => !v)} aria-expanded={colMenu} aria-label="Choose columns" title="Columns" className="hidden size-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink md:grid"><Columns3 className="size-4" /></button>
            {colMenu && (
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-line bg-surface p-1.5 shadow-lg" onMouseLeave={() => setColMenu(false)}>
                {columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-sunken">
                    <input type="checkbox" className="accent-[var(--color-brand)]" checked={!hidden.has(c.key)} onChange={() => setHidden((h) => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </div>
          {exportName && (
            <button type="button" onClick={() => downloadCsv(exportName, toCsv(visible.map((c) => c.header), filtered.map((r) => visible.map((c) => plain(c, r) ?? null))))} aria-label="Export CSV" title="Export CSV" className="grid size-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><Download className="size-4" /></button>
          )}
        </div>
      </div>

      {bulkActions && selRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft px-4 py-2 text-[13px]" role="region" aria-label="Bulk actions">
          <span className="font-medium text-brand">{selRows.length} selected</span>
          <button type="button" onClick={clear} className="text-muted underline-offset-2 hover:underline">Clear</button>
          <div className="ml-auto flex flex-wrap gap-2">{bulkActions(selRows, clear)}</div>
        </div>
      )}

      {!filtered.length ? (
        <p className="px-4 py-10 text-center text-sm text-muted">No {label} match &ldquo;{q}&rdquo;.</p>
      ) : (
        <>
          {/* Desktop / tablet */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  {bulkActions && (
                    <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Select all on this page" className="accent-[var(--color-brand)]" checked={allOnPage} onChange={() => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => (allOnPage ? n.delete(rowKey(r)) : n.add(rowKey(r)))); return n; })} /></th>
                  )}
                  {visible.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} className={cx('whitespace-nowrap px-4 py-2.5 font-medium', c.align === 'right' && 'text-right')}>
                      {c.sortable !== false ? (
                        <button type="button" onClick={() => toggleSort(c.key)} className={cx('inline-flex items-center gap-1 hover:text-ink', c.align === 'right' && 'flex-row-reverse')}>
                          {c.header}
                          {sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
                        </button>
                      ) : c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const href = rowHref?.(r);
                  const k = rowKey(r);
                  return (
                    <tr key={k} className={cx('border-b border-line/70 last:border-0 hover:bg-surface-2', selected.has(k) && 'bg-brand-soft/60')}>
                      {bulkActions && <td className="px-4 py-3"><input type="checkbox" aria-label="Select row" className="accent-[var(--color-brand)]" checked={selected.has(k)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} /></td>}
                      {visible.map((c, i) => (
                        <td key={c.key} className={cx('px-4 py-3 text-ink-2', c.align === 'right' && 'text-right tabular', c.className)}>
                          {i === 0 && href ? <Link href={href} className="font-medium text-ink hover:text-brand">{c.cell ? c.cell(r) : String(plain(c, r) ?? '—')}</Link> : c.cell ? c.cell(r) : String(plain(c, r) ?? '—')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Phone: cards */}
          <ul className="divide-y divide-line md:hidden">
            {pageRows.map((r) => {
              const primary = columns.find((c) => c.mobile === 'primary') ?? columns[0]!;
              const secondary = columns.find((c) => c.mobile === 'secondary');
              const rest = visible.filter((c) => c !== primary && c !== secondary && c.mobile !== 'hide').slice(0, 4);
              const href = rowHref?.(r);
              const inner = (
                <div className="px-4 py-3">
                  <p className="font-medium text-ink">{primary.cell ? primary.cell(r) : String(plain(primary, r) ?? '—')}</p>
                  {secondary && <p className="text-[13px] text-muted">{secondary.cell ? secondary.cell(r) : String(plain(secondary, r) ?? '')}</p>}
                  {rest.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                      {rest.map((c) => <div key={c.key} className="min-w-0"><dt className="text-xs text-muted">{c.header}</dt><dd className="truncate text-ink-2">{c.cell ? c.cell(r) : String(plain(c, r) ?? '—')}</dd></div>)}
                    </dl>
                  )}
                </div>
              );
              return <li key={rowKey(r)}>{href ? <Link href={href} className="block active:bg-sunken">{inner}</Link> : inner}</li>;
            })}
          </ul>
        </>
      )}

      {filtered.length > pageSize && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-muted">
          <span className="tabular">{cur * pageSize + 1}–{Math.min(filtered.length, (cur + 1) * pageSize)} of {filtered.length.toLocaleString('en-IN')}</span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page" className="grid size-8 place-items-center rounded-md hover:bg-sunken disabled:opacity-40"><ChevronLeft className="size-4" /></button>
            <span className="tabular">Page {cur + 1} of {pages}</span>
            <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page" className="grid size-8 place-items-center rounded-md hover:bg-sunken disabled:opacity-40"><ChevronRight className="size-4" /></button>
          </div>
        </nav>
      )}
    </div>
  );
}
