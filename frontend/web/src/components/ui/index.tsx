import { cx } from '@/lib/format';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-brand text-brand-fg hover:brightness-110 shadow-sm',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-canvas',
        variant === 'ghost' && 'hover:bg-canvas',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110',
        className,
      )}
    />
  );
}
export function Input({ label, hint, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium">{label}</span>}
      <input {...p} className={cx('h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20', error && 'border-bad', className)} />
      {error ? <span className="text-xs text-bad">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
export function Textarea({ label, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium">{label}</span>}
      <textarea {...p} className={cx('w-full rounded-lg border border-line bg-surface p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20', className)} />
    </label>
  );
}
export function Select({ label, options, className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium">{label}</span>}
      <select {...p} className={cx('h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm', className)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface shadow-sm', className)}>
      {(title || action) && <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3"><h2 className="font-semibold">{title}</h2>{action}</header>}
      <div className="p-5">{children}</div>
    </section>
  );
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand'; children: ReactNode }) {
  const t = { neutral: 'bg-canvas text-muted border-line', ok: 'bg-ok/10 text-ok border-ok/20', warn: 'bg-warn/10 text-warn border-warn/20', bad: 'bg-bad/10 text-bad border-bad/20', brand: 'bg-brand/10 text-brand border-brand/20' }[tone];
  return <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', t)}>{children}</span>;
}
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
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
