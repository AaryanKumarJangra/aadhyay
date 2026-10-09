import { ShieldAlert } from 'lucide-react';
import type { EffectiveRow } from '@aadhyay/contracts';
import { ScopeBadge, Badge, EmptyState } from '@/components/ui';

/** "View effective access": module → permission → scope → source role, in plain language. */
export function EffectiveAccessList({ rows, emptyText = 'No permissions in this institution yet.' }: { rows: EffectiveRow[]; emptyText?: string }) {
  if (!rows.length) return <EmptyState compact title={emptyText} />;
  const byModule = new Map<string, EffectiveRow[]>();
  for (const r of rows) byModule.set(r.moduleLabel, [...(byModule.get(r.moduleLabel) ?? []), r]);
  return (
    <div className="space-y-4">
      {[...byModule].map(([mod, list]) => (
        <section key={mod} className="rounded-lg border border-line">
          <h3 className="border-b border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold text-ink">{mod} <span className="font-normal text-muted">· {list.length}</span></h3>
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.key} className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">{r.explanation}</p>
                  <p className="font-mono text-[11px] text-faint">{r.key}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {r.sensitive && <Badge tone="warn" icon={<ShieldAlert aria-hidden />}>Sensitive</Badge>}
                  <ScopeBadge scope={r.scope} />
                  <Badge tone="indigo">{r.source.roleName}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
