'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { call } from '@/lib/client';
import { Avatar, Button, ConfirmDialog, DataTable, StatusBadge, humanize, statusTone, useToast, type Column } from '@/components/ui';

export type Leave = { id: string; subjectType: 'student' | 'staff'; subjectName: string | null; className: string | null; fromDate: string; toDate: string; reason: string; status: string; appliedByName: string | null; createdAt: string };
const d = (x: string) => new Date(`${x}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1;

export function LeaveList({ rows, canDecide }: { rows: Leave[]; canDecide: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [decide, setDecide] = useState<{ leave: Leave; status: 'approved' | 'rejected' } | null>(null);
  const cols: Column<Leave>[] = [
    { key: 'who', header: 'Who', mobile: 'primary', value: (l) => l.subjectName ?? '', cell: (l) => <span className="flex items-center gap-2.5"><Avatar name={l.subjectName ?? '?'} size={28} /><span><span className="block font-medium text-ink">{l.subjectName ?? 'Unknown'}</span><span className="text-xs text-muted">{l.subjectType === 'student' ? l.className ?? 'Student' : 'Staff'}</span></span></span> },
    { key: 'dates', header: 'Dates', mobile: 'secondary', value: (l) => l.fromDate, cell: (l) => <span>{d(l.fromDate)}{l.toDate !== l.fromDate ? ` – ${d(l.toDate)}` : ''} <span className="text-xs text-muted">({days(l.fromDate, l.toDate)} {days(l.fromDate, l.toDate) === 1 ? 'day' : 'days'})</span></span> },
    { key: 'reason', header: 'Reason', value: (l) => l.reason, cell: (l) => <span className="line-clamp-2 max-w-xs">{l.reason}</span> },
    { key: 'by', header: 'Applied by', value: (l) => l.appliedByName ?? '' },
    { key: 'status', header: 'Status', value: (l) => l.status, cell: (l) => <StatusBadge tone={statusTone(l.status)}>{humanize(l.status)}</StatusBadge> },
    ...(canDecide ? [{ key: 'act', header: '', sortable: false, mobile: 'hide' as const, cell: (l: Leave) => l.status === 'pending' ? (
      <span className="flex justify-end gap-1.5"><Button size="sm" variant="secondary" icon={<X />} onClick={() => setDecide({ leave: l, status: 'rejected' })}>Reject</Button><Button size="sm" icon={<Check />} onClick={() => setDecide({ leave: l, status: 'approved' })}>Approve</Button></span>
    ) : null }] : []),
  ];
  return (
    <>
      <DataTable rows={rows} columns={cols} rowKey={(l) => l.id} label="leave requests" exportName="leave-requests" searchPlaceholder="Search name or reason"
        empty={{ title: 'No leave requests', description: 'Requests from parents (in the app) and staff appear here for approval.' }} />
      <ConfirmDialog open={!!decide} onClose={() => setDecide(null)} tone={decide?.status === 'approved' ? 'primary' : 'danger'} confirmLabel={decide?.status === 'approved' ? 'Approve leave' : 'Reject leave'}
        title={`${decide?.status === 'approved' ? 'Approve' : 'Reject'} leave for ${decide?.leave.subjectName ?? ''}?`}
        consequence={decide?.status === 'approved' ? <>The days {decide && d(decide.leave.fromDate)}–{decide && d(decide.leave.toDate)} are marked “Leave” in attendance and the applicant is notified.</> : <>The applicant is notified that the request was rejected.</>}
        onConfirm={async () => { await call(`/attendance/leave/${decide!.leave.id}/decide`, { body: { status: decide!.status } }); toast({ tone: 'ok', title: `Leave ${decide!.status}` }); router.refresh(); }} />
    </>
  );
}
