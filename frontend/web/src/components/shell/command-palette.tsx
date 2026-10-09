'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, FileText, GraduationCap, Loader2, ReceiptText, Search, Target, UsersRound, type LucideIcon } from 'lucide-react';
import { cx } from '@/lib/format';
import type { NavGroup } from '@/lib/navigation';
import { NAV_ICONS } from './icons';

type Hit = { type: 'page' | 'student' | 'staff' | 'receipt' | 'lead'; id: string; title: string; subtitle: string; href: string; icon: LucideIcon };
const TYPE_ICON: Record<string, LucideIcon> = { student: GraduationCap, staff: UsersRound, receipt: ReceiptText, lead: Target };
const TYPE_LABEL: Record<Hit['type'], string> = { page: 'Pages', student: 'Students', staff: 'Staff', receipt: 'Receipts', lead: 'Enquiries' };

/**
 * Cmd/Ctrl+K. Pages come from the user's own navigation (already permission-filtered); records come from /search,
 * which applies the same permission and scope rules as the rest of the API.
 */
export function CommandPalette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavGroup[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(''); setRemote([]); setIdx(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setRemote([]); setErr(''); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/v1/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        if (!r.ok) throw new Error('Search is unavailable right now');
        const rows = (await r.json()) as Omit<Hit, 'icon'>[];
        setRemote(rows.map((h) => ({ ...h, icon: TYPE_ICON[h.type] ?? FileText })));
        setErr('');
      } catch (e) { if (!ctl.signal.aborted) setErr(e instanceof Error ? e.message : 'Search failed'); } finally { if (!ctl.signal.aborted) setLoading(false); }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  const pages = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const all = nav.flatMap((g) => g.items.map((i) => ({ type: 'page' as const, id: i.key, title: i.label, subtitle: g.label, href: i.href, icon: NAV_ICONS[i.icon] })));
    return (needle ? all.filter((p) => p.title.toLowerCase().includes(needle) || p.subtitle.toLowerCase().includes(needle)) : all).slice(0, needle ? 6 : 8);
  }, [q, nav]);
  const hits = [...pages, ...remote];
  useEffect(() => setIdx(0), [q, remote.length]);

  const go = (h: Hit) => { onClose(); router.push(h.href); };
  if (!open) return null;
  const groups = (['page', 'student', 'staff', 'receipt', 'lead'] as const).map((t) => ({ t, items: hits.filter((h) => h.type === t) })).filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-rise overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-3 border-b border-line px-4">
          {loading ? <Loader2 className="size-4 animate-spin text-faint" /> : <Search className="size-4 text-faint" aria-hidden />}
          <input
            ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students, staff, receipts, pages…" aria-label="Search" role="combobox" aria-expanded aria-controls="cmdk-list" aria-activedescendant={hits[idx] ? `cmdk-${idx}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter' && hits[idx]) go(hits[idx]!);
            }}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line bg-sunken px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="cmdk-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2 scrollbar-thin">
          {groups.map(({ t, items }) => (
            <li key={t} role="presentation">
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{TYPE_LABEL[t]}</p>
              <ul role="presentation">
                {items.map((h) => {
                  const i = hits.indexOf(h);
                  const Icon = h.icon;
                  return (
                    <li key={`${h.type}-${h.id}`} id={`cmdk-${i}`} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => go(h)}
                      className={cx('flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2', i === idx ? 'bg-brand-soft' : '')}>
                      <span className={cx('grid size-8 shrink-0 place-items-center rounded-md', i === idx ? 'bg-surface text-brand' : 'bg-sunken text-muted')}><Icon className="size-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{h.title}</span><span className="block truncate text-xs text-muted">{h.subtitle}</span></span>
                      {i === idx && <CornerDownLeft className="size-3.5 text-faint" aria-hidden />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {!hits.length && !loading && <li className="px-3 py-8 text-center text-sm text-muted">{err || (q.trim().length < 2 ? 'Type at least 2 letters.' : `No results for “${q}”.`)}</li>}
        </ul>
        <p className="border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-muted">Results only include records your role can open.</p>
      </div>
    </div>
  );
}
