import { capi } from '@/lib/control-api';
import { PageHeader, Stat } from '@/components/ui';
import { inr } from '@/lib/format';
export default async function Overview() {
  const m = await capi('/metrics');
  const by = Object.fromEntries(m.tenantsByStatus.map((x: any) => [x.status, x.n]));
  return (
    <>
      <PageHeader title="Overview" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="MRR" value={inr(m.mrrPaise)} sub={`ARR ${inr(m.arrPaise)}`} tone="ok" />
        <Stat label="Paying" value={by.active ?? 0} />
        <Stat label="In trial" value={by.trial ?? 0} />
        <Stat label="Grace / suspended" value={`${by.grace ?? 0} / ${by.suspended ?? 0}`} tone={(by.grace ?? 0) + (by.suspended ?? 0) ? 'warn' : undefined} />
      </div>
    </>
  );
}
