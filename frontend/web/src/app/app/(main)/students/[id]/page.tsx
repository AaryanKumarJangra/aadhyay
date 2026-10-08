import { api } from '@/lib/server-api';
import { Card, PageHeader, Stat, Table, Badge } from '@/components/ui';
import { inr, date } from '@/lib/format';

export default async function Student({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, led] = await Promise.all([api(`/people/students/${id}`), api(`/fees/students/${id}/ledger`).catch(() => null)]);
  return (
    <>
      <PageHeader title={s.name} sub={`${s.admissionNo}${s.current ? ` · ${s.current.className}-${s.current.sectionName}` : ''}`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Attendance (1 yr)" value={s.attendance.pct !== null ? `${s.attendance.pct}%` : '—'} sub={`${s.attendance.present}/${s.attendance.days} days`} />
        <Stat label="Fees paid" value={inr(s.fees.paidPaise)} tone="ok" />
        <Stat label="Due" value={inr(s.fees.duePaise)} />
        <Stat label="Overdue" value={inr(s.fees.overduePaise)} tone={s.fees.overduePaise ? 'bad' : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Guardians">
          <ul className="space-y-2 text-sm">{s.guardians.map((g: any) => <li key={g.id} className="flex justify-between"><span>{g.name} <span className="capitalize text-muted">({g.relation})</span></span><span className="tabular">{g.phone}</span></li>)}</ul>
          {s.siblings.length > 0 && <p className="mt-4 text-sm text-muted">Siblings: {s.siblings.map((x: any) => x.name).join(', ')}</p>}
        </Card>
        <Card title="Profile">
          <dl className="grid grid-cols-2 gap-2 text-sm">{[['DOB', date(s.dob)], ['Gender', s.gender], ['Category', s.category], ['Blood group', s.bloodGroup], ['Admitted', date(s.admittedOn)], ['Status', s.status]].map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="capitalize">{v ?? '—'}</dd></div>)}</dl>
        </Card>
      </div>
      {led && <Card title="Fee ledger" className="mt-6"><Table rows={led.lines} cols={[
        { key: 'title', label: 'Fee' }, { key: 'dueOn', label: 'Due', render: (l: any) => date(l.dueOn) },
        { key: 'amountPaise', label: 'Amount', render: (l: any) => inr(l.amountPaise), className: 'text-right tabular' },
        { key: 'paidPaise', label: 'Paid', render: (l: any) => inr(l.paidPaise + l.lateFeePaise), className: 'text-right tabular' },
        { key: 'outstandingPaise', label: 'Balance', render: (l: any) => <span className={l.overdue ? 'text-bad' : ''}>{inr(l.outstandingPaise)}</span>, className: 'text-right tabular' },
        { key: 'status', label: '', render: (l: any) => <Badge tone={l.status === 'paid' ? 'ok' : l.overdue ? 'bad' : 'neutral'}>{l.status}</Badge> },
      ]} /></Card>}
    </>
  );
}
