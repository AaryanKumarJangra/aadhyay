import Link from 'next/link';

import { CITIES } from '@/lib/cities';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4" aria-label="Main">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">आ</span>Aadhyay</Link>
          <div className="hidden items-center gap-6 text-sm md:flex">
            <Link href="/#features" className="hover:text-brand">Features</Link>
            <Link href="/pricing" className="hover:text-brand">Pricing</Link>
            <Link href="/#messenger" className="hover:text-brand">Free Messenger</Link>
            <Link href="/school-erp/meerut" className="hover:text-brand">Meerut</Link>
            <Link href="/app/login" className="hover:text-brand">Login</Link>
          </div>
          <Link href="/signup" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Start free — 90 days</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-4">
          <div><p className="font-semibold">Aadhyay</p><p className="mt-2 text-muted">School, college & coaching operating system. Made for India, hosted in India.</p></div>
          <div><p className="font-semibold">Product</p><ul className="mt-2 space-y-1 text-muted"><li><Link href="/pricing">Pricing</Link></li><li><Link href="/signup">Free trial</Link></li><li><Link href="/demo">Book a demo</Link></li></ul></div>
          <div><p className="font-semibold">Cities</p><ul className="mt-2 grid grid-cols-2 gap-1 text-muted">{CITIES.slice(0, 8).map((c) => <li key={c}><Link href={`/school-erp/${c}`} className="capitalize">{c.replace('-', ' ')}</Link></li>)}</ul></div>
          <div><p className="font-semibold">Company</p><ul className="mt-2 space-y-1 text-muted"><li>All prices in INR + 18% GST</li><li>DPDP-ready · Data in India</li></ul></div>
        </div>
        <p className="pb-8 text-center text-xs text-muted">© {new Date().getFullYear()} Aadhyay. All rights reserved.</p>
      </footer>
    </div>
  );
}
