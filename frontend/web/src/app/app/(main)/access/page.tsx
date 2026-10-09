import type { EffectiveRow } from '@aadhyay/contracts';
import { api } from '@/lib/server-api';
import { getMe } from '@/lib/me';
import { Card, PageHeader, RoleBadge } from '@/components/ui';
import { EffectiveAccessList } from '@/components/access/effective-access';
import { WhyCantI } from '@/components/access/why-cant-i';
import type { Catalogue } from '@/components/access/role-editor';

export const metadata = { title: 'My access' };

export default async function MyAccess() {
  const [me, mine, catalogue] = await Promise.all([getMe(), api<{ roles: { name: string }[]; rows: EffectiveRow[] }>('/access/me'), api<Catalogue>('/access/catalogue')]);
  const options = catalogue.modules.flatMap((m) => m.resources.flatMap((r) => r.actions.map((a) => ({ value: a.key, label: `${m.label} · ${r.label}: ${a.phrase}` }))));
  return (
    <>
      <PageHeader title="My access" description="Everything your roles let you do in this institution, where it applies, and which role grants it."
        meta={me.roles.length ? me.roles.map((r) => <RoleBadge key={r.key} name={r.name} />) : undefined} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <EffectiveAccessList rows={mine.rows} emptyText="You have no permissions in this institution yet." />
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card title="Why can’t I…?" description="Pick an action to see whether you can do it, and why.">
            <WhyCantI options={options} />
          </Card>
        </div>
      </div>
    </>
  );
}
