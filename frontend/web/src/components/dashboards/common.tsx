import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info, XCircle } from 'lucide-react';
import { cx } from '@/lib/format';

export const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
export const inrFull = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
export const inrShort = (paise: number) => {
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};

/** Date-range presets in one row above the content they scope (dataviz: filters first, presets as choices). */
export function RangeFilter({ value, base = '/app' }: { value: number; base?: string }) {
  return (
    <div role="group" aria-label="Date range" className="inline-flex rounded-md border border-line bg-surface p-0.5 shadow-xs">
      {[7, 30, 90].map((d) => (
        <Link key={d} href={d === 30 ? base : `${base}?range=${d}`} scroll={false} aria-current={value === d ? 'true' : undefined}
          className={cx('rounded-[5px] px-3 py-1.5 text-[13px] font-medium', value === d ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink')}>
          {d === 7 ? '7 days' : d === 30 ? '30 days' : '90 days'}
        </Link>
      ))}
    </div>
  );
}

export type AlertItem = { tone: 'bad' | 'warn' | 'info'; title: string; detail: string; href: string };
export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface shadow-sm">
      <header className="flex items-center justify-between px-5 pt-4"><h2 className="text-[15px] font-semibold">Needs attention</h2><span className="rounded-full bg-sunken px-2 text-xs tabular text-muted">{alerts.length}</span></header>
      {alerts.length ? (
        <ul className="flex-1 space-y-2 p-4">
          {alerts.map((a, i) => {
            const Icon = a.tone === 'bad' ? XCircle : a.tone === 'warn' ? AlertTriangle : Info;
            return (
              <li key={i}>
                <Link href={a.href} className="group flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-line-strong hover:bg-surface-2">
                  <Icon className={cx('mt-0.5 size-4 shrink-0', a.tone === 'bad' ? 'text-bad' : a.tone === 'warn' ? 'text-warn' : 'text-info')} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-ink">{a.title}</span><span className="block text-xs text-muted">{a.detail}</span></span>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-faint group-hover:text-ink-2" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><p className="text-sm font-medium">All clear</p><p className="text-xs text-muted">Nothing needs your attention right now.</p></div>
      )}
    </section>
  );
}

export function Greeting({ name, today, subtitle }: { name: string; today: string; subtitle?: string }) {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const date = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return { title: `${part}, ${name.split(' ')[0]}`, description: subtitle ? `${date} · ${subtitle}` : date };
}
