'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Building2, CreditCard, FileClock, LayoutDashboard, LogOut, Menu, Rocket, Target, Wallet, X, type LucideIcon } from 'lucide-react';
import { cx } from '@/lib/format';
import { Avatar } from '@/components/ui/badge';
import { ToastProvider } from '@/components/ui/overlay';

export type ControlNavItem = { href: string; label: string; icon: 'overview' | 'tenants' | 'onboard' | 'pricing' | 'finance' | 'leads' | 'audit' };
const ICONS: Record<ControlNavItem['icon'], LucideIcon> = { overview: LayoutDashboard, tenants: Building2, onboard: Rocket, pricing: CreditCard, finance: Wallet, leads: Target, audit: FileClock };

function Nav({ items, onNavigate }: { items: { group: string; items: ControlNavItem[] }[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Control plane" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2">
      {items.map((g) => (
        <div key={g.group}>
          <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon];
              const on = it.href === '/control' ? path === '/control' : path.startsWith(it.href);
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={onNavigate} aria-current={on ? 'page' : undefined} className={cx('flex h-9 items-center gap-3 rounded-md px-2.5 text-[13.5px]', on ? 'bg-brand-soft font-medium text-brand' : 'text-ink-2 hover:bg-sunken hover:text-ink')}>
                    <Icon className={cx('size-[18px]', on ? 'text-brand' : 'text-muted')} aria-hidden />{it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const Brand = () => (
  <Link href="/control" className="flex h-14 items-center gap-2.5 px-4">
    <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-indigo text-sm font-bold text-white shadow-xs">A</span>
    <span><span className="block text-sm font-semibold text-ink">Aadhyay Control</span><span className="block text-[11px] text-muted">Platform operations</span></span>
  </Link>
);

/** The company's control plane: separate world, separate navigation, platform data only. */
export function ControlShell({ nav, user, children }: { nav: { group: string; items: ControlNavItem[] }[]; user: { name: string; role: string }; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const path = usePathname();
  useEffect(() => setDrawer(false), [path]);
  const logout = async () => { await fetch('/api/control/logout', { method: 'POST' }); location.href = '/control/login'; };
  return (
    <ToastProvider>
      <div className="canvas-wash flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/80 backdrop-blur lg:flex"><Brand /><Nav items={nav} /></aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-ink/25" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[min(280px,85vw)] flex-col bg-surface shadow-lg">
              <div className="flex items-center justify-between pr-2"><Brand /><button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="grid size-9 place-items-center rounded-md hover:bg-sunken"><X className="size-5" /></button></div>
              <Nav items={nav} onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line/80 px-3 sm:px-5">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Open navigation" className="grid size-9 place-items-center rounded-md hover:bg-sunken lg:hidden"><Menu className="size-5" /></button>
            <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo">Platform</span>
            <div className="ml-auto flex items-center gap-3">
              <span className="flex items-center gap-2"><Avatar name={user.name} size={28} /><span className="hidden text-left sm:block"><span className="block text-[13px] font-medium leading-tight">{user.name}</span><span className="block text-[11px] capitalize leading-tight text-muted">{user.role.replace(/_/g, ' ')}</span></span></span>
              <button type="button" onClick={logout} aria-label="Sign out" title="Sign out" className="grid size-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><LogOut className="size-4" /></button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
