'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cx } from '@/lib/format';
import type { NavItem } from '@/lib/nav';

export function Sidebar({ items, tenantName, brand }: { items: NavItem[]; tenantName: string; brand?: string }) {
  const path = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-surface md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-line px-4 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">{tenantName[0]}</span><span className="line-clamp-1">{tenantName}</span></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Console">
        {items.map((n) => {
          const I = (Icons as any)[n.icon] ?? Icons.Circle;
          const active = n.href === '/app' ? path === '/app' : path.startsWith(n.href);
          return <Link key={n.href} href={n.href} className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', active ? 'bg-brand/10 font-medium text-brand' : 'text-muted hover:bg-canvas hover:text-ink')}><I className="h-4 w-4" aria-hidden />{n.label}</Link>;
        })}
      </nav>
      <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/app/login'; }} className="m-3 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink">Log out</button>
    </aside>
  );
}
export function MobileNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden" aria-label="Mobile">
      {items.slice(0, 5).map((n) => { const I = (Icons as any)[n.icon] ?? Icons.Circle; return <Link key={n.href} href={n.href} className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px]', path === n.href ? 'text-brand' : 'text-muted')}><I className="h-5 w-5" />{n.label}</Link>; })}
    </nav>
  );
}
