'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronsLeft, ChevronsRight, LogOut, Menu, Search, X, Building2, KeyRound, ChevronDown } from 'lucide-react';
import { cx } from '@/lib/format';
import { findNav, type NavGroup } from '@/lib/navigation';
import { Avatar } from '@/components/ui/badge';
import { ToastProvider } from '@/components/ui/overlay';
import { NAV_ICONS } from './icons';
import { CommandPalette } from './command-palette';
import { NotificationBell } from './notifications';

export interface ShellProps {
  nav: NavGroup[];
  tenant: { name: string; logoUrl?: string | null; segment: string };
  user: { name: string; roles: string[] };
  memberships: { tenantId: string; tenantName: string }[];
  currentTenantId: string;
  banner?: ReactNode;
  children: ReactNode;
}

function Brand({ tenant, collapsed }: { tenant: ShellProps['tenant']; collapsed: boolean }) {
  return (
    <Link href="/app" className="flex h-14 items-center gap-2.5 px-4" aria-label={`${tenant.name} dashboard`}>
      {tenant.logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={tenant.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
        : <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-semibold text-white shadow-xs">{tenant.name.trim()[0]?.toUpperCase()}</span>}
      {!collapsed && <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{tenant.name}</span><span className="block text-[11px] capitalize text-muted">{tenant.segment} · Aadhyay</span></span>}
    </Link>
  );
}

function NavList({ nav, collapsed, onNavigate }: { nav: NavGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const active = findNav(path)?.item.key;
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2 scrollbar-thin">
      {nav.map((g) => (
        <div key={g.key}>
          {!collapsed && g.key !== 'overview' && <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{g.label}</p>}
          {collapsed && g.key !== 'overview' && <div className="mx-2.5 mb-2 border-t border-line" />}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = NAV_ICONS[it.icon];
              const on = it.key === active;
              return (
                <li key={it.key}>
                  <Link href={it.href} onClick={onNavigate} aria-current={on ? 'page' : undefined} title={collapsed ? it.label : undefined}
                    className={cx('group flex h-9 items-center gap-3 rounded-md px-2.5 text-[13.5px] transition-colors', collapsed && 'justify-center px-0',
                      on ? 'bg-brand-soft font-medium text-brand' : 'text-ink-2 hover:bg-sunken hover:text-ink')}>
                    <Icon className={cx('size-[18px] shrink-0', on ? 'text-brand' : 'text-muted group-hover:text-ink-2')} aria-hidden />
                    {!collapsed && <span className="truncate">{it.label}</span>}
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

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/app/login';
}

function UserMenu({ user, memberships, currentTenantId }: Pick<ShellProps, 'user' | 'memberships' | 'currentTenantId'>) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const others = memberships.filter((m, i, a) => m.tenantId !== currentTenantId && a.findIndex((x) => x.tenantId === m.tenantId) === i);
  const switchTo = async (tenantId: string) => {
    setSwitching(tenantId);
    const r = await fetch('/api/auth/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId }) });
    if (r.ok) location.href = '/app'; else setSwitching(null);
  };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-sunken">
        <Avatar name={user.name} size={28} />
        <span className="hidden text-left sm:block"><span className="block max-w-[140px] truncate text-[13px] font-medium leading-tight text-ink">{user.name}</span><span className="block max-w-[140px] truncate text-[11px] leading-tight text-muted">{user.roles.join(', ') || 'Member'}</span></span>
        <ChevronDown className="hidden size-3.5 text-faint sm:block" aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-2 w-64 animate-rise rounded-lg border border-line bg-surface p-1.5 shadow-lg">
            <div className="px-2.5 py-2"><p className="text-sm font-medium text-ink">{user.name}</p><p className="text-xs text-muted">{user.roles.join(' · ') || 'Member'}</p></div>
            <div className="my-1 border-t border-line" />
            <Link role="menuitem" href="/app/access" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-2 hover:bg-sunken"><KeyRound className="size-4" />My access & permissions</Link>
            {others.length > 0 && (
              <>
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Switch institution</p>
                {others.map((m) => (
                  <button key={m.tenantId} role="menuitem" type="button" disabled={!!switching} onClick={() => switchTo(m.tenantId)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-sunken disabled:opacity-50">
                    <Building2 className="size-4" />{switching === m.tenantId ? 'Switching…' : m.tenantName}
                  </button>
                ))}
              </>
            )}
            <div className="my-1 border-t border-line" />
            <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-bad hover:bg-bad-soft"><LogOut className="size-4" />Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Desktop: sidebar (expanded / collapsed rail, remembered) + header. Phone/tablet: header + slide-in drawer. */
export function AppShell({ nav, tenant, user, memberships, currentTenantId, banner, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const path = usePathname();
  const here = findNav(path);
  useEffect(() => { try { setCollapsed(localStorage.getItem('aad:nav') === 'rail'); } catch {} }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch((v) => !v); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('aad:nav', c ? 'full' : 'rail'); } catch {} return !c; });

  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg">Skip to content</a>
      <div className="canvas-wash flex min-h-dvh">
        <aside className={cx('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface/80 backdrop-blur lg:flex', collapsed ? 'w-[68px]' : 'w-64')}>
          <Brand tenant={tenant} collapsed={collapsed} />
          <NavList nav={nav} collapsed={collapsed} />
          <button type="button" onClick={toggle} className="m-3 flex h-9 items-center justify-center gap-2 rounded-md text-[13px] text-muted hover:bg-sunken hover:text-ink" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
          </button>
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 animate-fade-in bg-ink/25 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] animate-rise flex-col bg-surface shadow-lg">
              <div className="flex items-center justify-between pr-2"><Brand tenant={tenant} collapsed={false} /><button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="grid size-9 place-items-center rounded-md text-muted hover:bg-sunken"><X className="size-5" /></button></div>
              <NavList nav={nav} collapsed={false} onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {banner}
          <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line/80 px-3 sm:px-5">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Open navigation" className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken lg:hidden"><Menu className="size-5" /></button>
            <p className="hidden min-w-0 truncate text-[13px] text-muted md:block">
              {here && here.group.key !== 'overview' ? <>{here.group.label} <span className="text-faint">/</span> <span className="text-ink-2">{here.item.label}</span></> : <span className="text-ink-2">Dashboard</span>}
            </p>
            <button type="button" onClick={() => setSearch(true)} className="ml-auto flex h-9 w-full max-w-[280px] items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] text-faint shadow-xs hover:border-line-strong sm:w-64">
              <Search className="size-4" aria-hidden /><span className="flex-1 text-left">Search…</span>
              <kbd className="hidden rounded border border-line bg-sunken px-1.5 font-sans text-[11px] text-muted sm:inline">Ctrl K</kbd>
            </button>
            <NotificationBell />
            <UserMenu user={user} memberships={memberships} currentTenantId={currentTenantId} />
          </header>
          <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
      <CommandPalette open={search} onClose={() => setSearch(false)} nav={nav} />
    </ToastProvider>
  );
}
