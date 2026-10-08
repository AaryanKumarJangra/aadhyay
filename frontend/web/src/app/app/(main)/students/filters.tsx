'use client';
import { useRouter, useSearchParams } from 'next/navigation';
export function StudentFilters({ tree }: { tree: any[] }) {
  const r = useRouter(); const sp = useSearchParams();
  const set = (k: string, v: string) => { const p = new URLSearchParams(sp); v ? p.set(k, v) : p.delete(k); r.push(`?${p}`); };
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <input defaultValue={sp.get('q') ?? ''} onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)} placeholder="Search name or admission no…" className="h-10 w-72 rounded-lg border border-line bg-surface px-3 text-sm" />
      <select value={sp.get('sectionId') ?? ''} onChange={(e) => set('sectionId', e.target.value)} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm">
        <option value="">All classes</option>
        {tree.flatMap((c) => c.sections.map((s: any) => <option key={s.id} value={s.id}>{c.name}-{s.name} ({s.strength})</option>))}
      </select>
    </div>
  );
}
