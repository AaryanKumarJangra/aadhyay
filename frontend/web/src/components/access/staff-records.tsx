'use client';
import { DataTable, StatusBadge, Avatar, type Column } from '@/components/ui';

export interface StaffRecord { id: string; employeeCode: string; name: string; phone: string | null; email: string | null; status: string; department: string | null; designation: string | null; joiningDate: string | null; userId: string | null }

const cols: Column<StaffRecord>[] = [
  { key: 'name', header: 'Name', mobile: 'primary', value: (s) => s.name, cell: (s) => <span className="flex items-center gap-2.5"><Avatar name={s.name} size={28} /><span className="font-medium text-ink">{s.name}</span></span> },
  { key: 'employeeCode', header: 'Code', mobile: 'secondary' },
  { key: 'designation', header: 'Designation', value: (s) => s.designation ?? '' },
  { key: 'department', header: 'Department', value: (s) => s.department ?? '' },
  { key: 'phone', header: 'Phone', value: (s) => s.phone ?? '' },
  { key: 'login', header: 'Login', value: (s) => (s.userId ? 'yes' : 'no'), cell: (s) => <StatusBadge tone={s.userId ? 'ok' : 'neutral'}>{s.userId ? 'Has login' : 'No login'}</StatusBadge> },
];

export function StaffRecords({ rows }: { rows: StaffRecord[] }) {
  return <DataTable rows={rows} columns={cols} rowKey={(s) => s.id} label="staff" exportName="staff" searchPlaceholder="Search name, code or phone"
    empty={{ title: 'No staff records yet', description: 'Add staff to manage HR details, attendance and payroll.' }} />;
}
