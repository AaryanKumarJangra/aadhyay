import Link from 'next/link';
import { api } from '@/lib/server-api';
import { PageHeader, Table, Badge } from '@/components/ui';
import { StudentFilters } from './filters';

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; sectionId?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  // The class tree only powers the filter; roles without academics access still get the list.
  const [list, tree] = await Promise.all([api(`/people/students?${qs}`), api('/academics/tree', { onForbidden: 'throw' }).catch(() => [])]);
  return (
    <>
      <PageHeader title="Students" sub={`${list.items.length}${list.nextCursor ? '+' : ''} shown`} actions={<><Link href="/app/students/new" className="rounded-lg bg-brand px-4 py-2 text-sm text-white">New admission</Link><a href="/api/v1/reports/export?dataset=students" className="rounded-lg border border-line bg-surface px-4 py-2 text-sm">Export CSV</a></>} />
      <StudentFilters tree={tree} />
      <Table rows={list.items} cols={[
        { key: 'admissionNo', label: 'Adm. no', className: 'tabular' },
        { key: 'name', label: 'Name', render: (s: any) => <Link href={`/app/students/${s.id}`} className="font-medium text-brand">{s.name}</Link> },
        { key: 'class', label: 'Class', render: (s: any) => (s.className ? `${s.className}-${s.sectionName}` : '—') },
        { key: 'rollNo', label: 'Roll' },
        { key: 'status', label: 'Status', render: (s: any) => <Badge tone={s.status === 'active' ? 'ok' : 'neutral'}>{s.status}</Badge> },
      ]} empty="No students yet. Add your first admission or import from Excel." />
    </>
  );
}
