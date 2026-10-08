import Link from 'next/link';
export const metadata = { robots: { index: false } };
export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-white"><nav className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 text-sm"><span className="font-bold">Aadhyay Control</span><Link href="/control">Overview</Link><Link href="/control/tenants">Institutions</Link><Link href="/control/finance">Finance & 80:20</Link></nav></header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
