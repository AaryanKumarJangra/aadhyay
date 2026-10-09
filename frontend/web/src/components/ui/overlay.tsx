'use client';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cx } from '@/lib/format';
import { Button } from './button';

/** Native <dialog>: focus trap, Esc to close and inert background for free. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} aria-labelledby={tid}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] open:animate-rise', size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 px-5 pt-5">
            <div><h2 id={tid} className="text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><X className="size-4" /></button>
          </header>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/**
 * Destructive or consequential action: states exactly what will happen, optionally asks for a reason
 * (recorded in the audit log), and keeps the button disabled while the action runs.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, consequence, confirmLabel = 'Confirm', tone = 'danger', reason }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> | void; title: string; consequence: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary';
  reason?: 'optional' | 'required';
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setText(''); setErr(''); } }, [open]);
  const go = async () => {
    setBusy(true); setErr('');
    try { await onConfirm(text.trim()); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not complete the action'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} disabled={reason === 'required' && text.trim().length < 3} onClick={go}>{confirmLabel}</Button></>}>
      <div className="flex gap-3 text-sm text-ink-2">
        {tone === 'danger' && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />}
        <div>{consequence}</div>
      </div>
      {reason && (
        <label className="mt-4 block text-[13px] font-medium text-ink-2">
          Reason {reason === 'required' ? <span className="text-bad">*</span> : <span className="font-normal text-muted">(optional)</span>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-1.5 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/15" placeholder="Recorded in the audit log" />
        </label>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </Modal>
  );
}

/** Side sheet for detail/edit without leaving the list (right on desktop, bottom-full on phones). */
export function Drawer({ open, onClose, title, children, footer, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="absolute inset-0 animate-fade-in bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
      <aside className={cx('absolute inset-y-0 right-0 flex w-full animate-rise flex-col border-l border-line bg-surface shadow-lg', width)}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken"><X className="size-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

// ---------------- Toasts ----------------
type Toast = { id: number; tone: 'ok' | 'bad' | 'info'; title: string; body?: string };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.tone === 'bad' ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-center gap-2 md:bottom-6 md:left-auto md:right-6 md:items-end">
        {items.map((t) => {
          const Icon = t.tone === 'ok' ? CheckCircle2 : t.tone === 'bad' ? XCircle : Info;
          return (
            <div key={t.id} role={t.tone === 'bad' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-lg">
              <Icon className={cx('mt-0.5 size-4 shrink-0', t.tone === 'ok' ? 'text-ok' : t.tone === 'bad' ? 'text-bad' : 'text-info')} aria-hidden />
              <div className="min-w-0 flex-1"><p className="font-medium text-ink">{t.title}</p>{t.body && <p className="mt-0.5 text-muted">{t.body}</p>}</div>
              <button type="button" aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} className="text-faint hover:text-ink"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- Tabs ----------------
/** URL-driven tabs (?tab=…): shareable, back-button friendly, server-renderable content. */
export function LinkTabs({ tabs, active, basePath }: { tabs: { key: string; label: ReactNode; count?: number }[]; active: string; basePath: string }) {
  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
      <nav aria-label="Sections" className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link key={t.key} href={`${basePath}${t.key === tabs[0]!.key ? '' : `?tab=${t.key}`}`} scroll={false} aria-current={t.key === active ? 'page' : undefined}
            className={cx('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors', t.key === active ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular text-muted">{t.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
