'use client';
import { DataTable, StatusBadge, humanize, statusTone, type Column } from '@/components/ui';

export type TenantRow = { id: string; name: string; slug: string; segment: string; status: string; planCode: string; city: string | null; state: string | null; periodEndsAt: string | null; createdAt: string; students: number; duePaise: number; lastActiveAt: string | null };
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');
const cols: Column<TenantRow>[] = [
  { key: 'name', header: 'Institution', mobile: 'primary', value: (t) => t.name, cell: (t) => <span><span className="block font-medium text-ink">{t.name}</span><span className="text-xs text-muted">{t.slug}</span></span> },
  { key: 'segment', header: 'Type', mobile: 'secondary', value: (t) => t.segment, cell: (t) => <span className="capitalize">{t.segment}</span> },
  { key: 'city', header: 'Location', value: (t) => [t.city, t.state].filter(Boolean).join(', ') },
  { key: 'planCode', header: 'Plan', value: (t) => humanize(t.planCode) },
  { key: 'students', header: 'Students', align: 'right', value: (t) => t.students, cell: (t) => t.students.toLocaleString('en-IN') },
  { key: 'due', header: 'Due', align: 'right', value: (t) => t.duePaise, cell: (t) => (t.duePaise ? <span className="text-bad">₹{Math.round(t.duePaise / 100).toLocaleString('en-IN')}</span> : '—') },
  { key: 'period', header: 'Period ends', value: (t) => t.periodEndsAt ?? '', cell: (t) => d(t.periodEndsAt) },
  { key: 'last', header: 'Last active', value: (t) => t.lastActiveAt ?? '', cell: (t) => d(t.lastActiveAt), hidden: true },
  { key: 'status', header: 'Status', value: (t) => t.status, cell: (t) => <StatusBadge tone={statusTone(t.status)}>{humanize(t.status)}</StatusBadge> },
];
export function TenantsTable({ rows }: { rows: TenantRow[] }) {
  return <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} rowHref={(t) => `/control/tenants/${t.id}`} label="institutions" exportName="institutions" searchPlaceholder="Search name, city, plan or status"
    empty={{ title: 'No institutions yet', description: 'Institutions appear here after self-serve sign-up or onboarding.' }} />;
}
