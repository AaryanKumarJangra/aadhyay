import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/format';
import { Sparkline } from '../charts/sparkline';

export interface Delta {
  /** Signed change, already in display units (percent points or %). */
  value: number | null;
  /** "vs last month" */
  period: string;
  /** Whether an increase is good news (attendance ↑ good, overdue ↑ bad). */
  upIsGood?: boolean;
  unit?: '%' | 'pts' | '';
}

export function DeltaPill({ value, period, upIsGood = true, unit = '%' }: Delta) {
  if (value === null || !Number.isFinite(value)) return <span className="text-xs text-muted">No earlier data to compare</span>;
  const flat = Math.abs(value) < 0.05;
  const good = flat ? null : value > 0 === upIsGood;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={cx('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular', good === null ? 'bg-sunken text-muted' : good ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
        <Icon className="size-3" aria-hidden />
        {value > 0 ? '+' : ''}{value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}{unit}
        <span className="sr-only">{good === null ? '(no change)' : good ? '(improved)' : '(worse)'}</span>
      </span>
      <span className="text-muted">{period}</span>
    </span>
  );
}

/**
 * KPI tile: label · value · change vs a named period · 12-point trend. Numbers always come with context.
 */
export function StatCard({ label, value, delta, trend, icon: Icon, footer, href, progress, tone }: {
  label: string; value: ReactNode; delta?: Delta; trend?: number[]; icon?: LucideIcon; footer?: ReactNode; href?: string;
  /** 0–100 meter under the value (e.g. collection %). */
  progress?: { value: number; label?: string };
  tone?: 'default' | 'warn' | 'bad';
}) {
  const body = (
    <div className={cx('group relative flex h-full flex-col rounded-xl border bg-surface p-4 shadow-sm transition-shadow', href && 'hover:shadow-md', tone === 'bad' ? 'border-bad/25' : tone === 'warn' ? 'border-warn/25' : 'border-line')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {Icon && <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="size-4" aria-hidden /></span>}
      </div>
      <p className="mt-1 text-[21px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">{value}</p>
      {delta && <div className="mt-1.5"><DeltaPill {...delta} /></div>}
      {progress && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-brand-soft" role="meter" aria-valuenow={Math.round(progress.value)} aria-valuemin={0} aria-valuemax={100} aria-label={progress.label ?? label}>
            <div className={cx('h-1.5 rounded-full', progress.value < 50 ? 'bg-bad' : progress.value < 80 ? 'bg-[var(--color-series-4)]' : 'bg-brand')} style={{ width: `${Math.max(0, Math.min(100, progress.value))}%` }} />
          </div>
          {progress.label && <p className="mt-1 text-xs text-muted">{progress.label}</p>}
        </div>
      )}
      {trend && trend.length > 1 && <div className="mt-auto pt-3"><Sparkline values={trend} label={`${label} trend`} /></div>}
      {footer && <div className="mt-auto pt-3 text-xs text-muted">{footer}</div>}
    </div>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:outline-2">{body}</Link> : body;
}

/** Percent change between two numbers, null when there's no baseline. */
export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
