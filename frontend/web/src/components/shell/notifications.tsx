'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react';
import { cx } from '@/lib/format';
import { CATEGORY_LABEL, categoryOf, deepLink, type NoticeCategory } from '@/lib/notifications';

type N = { id: string; eventKey: string; title: string; body: string; studentId: string | null; data: Record<string, unknown> | null; readAt: string | null; createdAt: string };

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
};

/** Header bell: unread count, category filter, mark read / all read, deep link to the exact record. */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<N[] | null>(null);
  const [error, setError] = useState('');
  const [cat, setCat] = useState<NoticeCategory | 'all'>('all');

  const refreshCount = useCallback(async () => {
    try { const r = await fetch('/api/v1/comms/inbox/unread-count'); if (r.ok) setUnread((await r.json()).unread); } catch { /* offline: keep last count */ }
  }, []);
  useEffect(() => {
    void refreshCount();
    const t = setInterval(refreshCount, 60_000);
    return () => clearInterval(t);
  }, [refreshCount]);
  useEffect(() => {
    if (!open) return;
    setError('');
    fetch('/api/v1/comms/inbox').then(async (r) => { if (!r.ok) throw new Error(); setItems(await r.json()); }).catch(() => setError('Couldn’t load notifications. Check your connection and try again.'));
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    const r = await fetch('/api/v1/comms/inbox/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return;
    const now = new Date().toISOString();
    setItems((xs) => xs?.map((x) => (body.all || body.ids?.includes(x.id) ? { ...x, readAt: x.readAt ?? now } : x)) ?? null);
    void refreshCount();
  };
  const shown = (items ?? []).filter((n) => cat === 'all' || categoryOf(n.eventKey) === cat);
  const cats = [...new Set((items ?? []).map((n) => categoryOf(n.eventKey)))];

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-16 z-40 animate-rise rounded-xl border border-line bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[380px]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <button type="button" onClick={() => markRead({ all: true })} disabled={!unread} className="inline-flex items-center gap-1 text-xs font-medium text-brand disabled:text-faint"><CheckCheck className="size-3.5" />Mark all read</button>
            </div>
            {cats.length > 1 && (
              <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 scrollbar-thin">
                {(['all', ...cats] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className={cx('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', cat === c ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-sunken')}>
                    {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              {error ? <p role="alert" className="px-4 py-8 text-center text-sm text-bad">{error}</p>
                : items === null ? <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-faint" /></div>
                : !shown.length ? <div className="flex flex-col items-center px-4 py-10 text-center"><BellOff className="mb-2 size-5 text-faint" /><p className="text-sm font-medium">You’re all caught up</p><p className="text-xs text-muted">Alerts about attendance, fees, transport and notices appear here.</p></div>
                : (
                  <ul className="divide-y divide-line">
                    {shown.map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => { void markRead({ ids: [n.id] }); setOpen(false); router.push(deepLink(n)); }} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2">
                          <span aria-hidden className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2"><span className={cx('truncate text-[13px]', n.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span><span className="shrink-0 text-[11px] text-faint">{ago(n.createdAt)}</span></span>
                            <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                            <span className="mt-1 inline-block text-[11px] text-faint">{CATEGORY_LABEL[categoryOf(n.eventKey)]}{!n.readAt && <span className="sr-only">, unread</span>}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
