import Link from 'next/link';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldOff, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/format';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('skeleton rounded-md', className)} />;
}

/** Card-shaped placeholder matching a stat row + chart grid, for route-level loading.tsx files. */
export function PageSkeleton({ stats = 4, panels = 2 }: { stats?: number; panels?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-7 w-72" /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: stats }, (_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: panels }, (_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Nothing here yet — say why, and what to do next. */
export function EmptyState({ icon: Icon, title, description, action, compact, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-2 text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {Icon && <span className="mb-3 grid size-11 place-items-center rounded-full bg-surface text-muted shadow-xs ring-1 ring-line"><Icon className="size-5" aria-hidden /></span>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <div className="mt-1 max-w-sm text-[13px] text-muted">{description}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, action, offline }: { title?: string; message?: ReactNode; action?: ReactNode; offline?: boolean }) {
  const Icon = offline ? WifiOff : AlertCircle;
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-bad/20 bg-bad-soft/50 px-6 py-10 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-surface text-bad ring-1 ring-bad/20"><Icon className="size-5" aria-hidden /></span>
      <p className="text-sm font-semibold text-ink">{offline ? 'You are offline' : title}</p>
      {message && <p className="mt-1 max-w-md text-[13px] text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const ALERT = {
  info: { icon: Info, cls: 'border-info/20 bg-info-soft text-info' },
  ok: { icon: CheckCircle2, cls: 'border-ok/20 bg-ok-soft text-ok' },
  warn: { icon: AlertTriangle, cls: 'border-warn/25 bg-warn-soft text-warn' },
  bad: { icon: AlertCircle, cls: 'border-bad/20 bg-bad-soft text-bad' },
};
export function Alert({ tone = 'info', title, children, action, className }: { tone?: keyof typeof ALERT; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { icon: Icon, cls } = ALERT[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-ink-2">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/**
 * "Why can't I do this?" — shown for API 403s and page guards. Explains the reason in words, names the permission,
 * and says who can change it.
 */
export function AccessDenied({ reason, permission, contact = 'Institution Owner or Administrator', back = '/app' }: { reason?: string; permission?: string; contact?: string; back?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center p-6">
      <div className="max-w-lg rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-bad-soft text-bad ring-1 ring-bad/20"><ShieldOff className="size-6" aria-hidden /></span>
        <h1 className="mt-4 text-lg font-semibold text-ink">You don&apos;t have permission to do this</h1>
        <p className="mt-2 text-sm text-ink-2">{reason ?? 'Your role does not include access to this page.'}</p>
        {permission && <p className="mt-3 text-xs text-muted">Permission needed: <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{permission}</code></p>}
        <p className="mt-4 text-[13px] text-muted">To get access, contact your <span className="font-medium text-ink-2">{contact}</span>.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href={back} className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white shadow-xs">Back to dashboard</Link>
          <Link href="/app/access" className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink shadow-xs">See my access</Link>
        </div>
      </div>
    </div>
  );
}
