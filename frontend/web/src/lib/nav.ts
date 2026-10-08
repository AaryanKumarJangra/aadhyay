import { hasPermission } from '@aadhyay/contracts';

export interface NavItem { href: string; label: string; icon: string; module?: string; perm?: string[]; kinds?: string[] }
/** Console navigation — shown only if the module is enabled AND the user has a permission for it. */
export const NAV: NavItem[] = [
  { href: '/app', label: 'Home', icon: 'LayoutDashboard' },
  { href: '/app/students', label: 'Students', icon: 'GraduationCap', module: 'people', perm: ['people.student.view'] },
  { href: '/app/attendance', label: 'Attendance', icon: 'ClipboardCheck', module: 'attendance', perm: ['attendance.student.create', 'attendance.student.view'] },
  { href: '/app/fees', label: 'Fees', icon: 'IndianRupee', module: 'fees', perm: ['fees.payment.view', 'fees.payment.create'] },
  { href: '/app/exams', label: 'Exams', icon: 'FileCheck', module: 'exams', perm: ['exams.exam.view', 'exams.marks.create'] },
  { href: '/app/notices', label: 'Notices', icon: 'Megaphone', module: 'comms', perm: ['comms.notice.create'] },
  { href: '/app/messenger', label: 'Messenger', icon: 'MessageCircle' },
  { href: '/app/transport', label: 'Transport', icon: 'Bus', module: 'transport', perm: ['transport.trip.view', 'transport.route.view'] },
  { href: '/app/crm', label: 'Admissions CRM', icon: 'Users', module: 'crm', perm: ['crm.lead.view'] },
  { href: '/app/website', label: 'Website', icon: 'Globe', module: 'cms', perm: ['cms.page.edit'] },
  { href: '/app/r/staff', label: 'Staff & HR', icon: 'Briefcase', module: 'people', perm: ['people.staff.view'] },
  { href: '/app/r/books', label: 'Library', icon: 'Library', module: 'library', perm: ['library.book.view'] },
  { href: '/app/r/items', label: 'Inventory', icon: 'Package', module: 'inventory', perm: ['inventory.item.view'] },
  { href: '/app/r/visitors', label: 'Front office', icon: 'DoorOpen', module: 'front-office', perm: ['front-office.visitor.view'] },
  { href: '/app/reports', label: 'Reports', icon: 'BarChart3', module: 'reports', perm: ['reports.dashboard.view'] },
  { href: '/app/billing', label: 'Plan & billing', icon: 'Receipt', perm: ['org.billing.view'] },
  { href: '/app/settings', label: 'Settings', icon: 'Settings', perm: ['org.settings.edit'] },
];
export function visibleNav(me: { permissions: string[]; kinds: string[] }, modules: string[]) {
  return NAV.filter((n) => (!n.module || modules.includes(n.module)) && (!n.perm || n.perm.some((p) => hasPermission(me.permissions, p))));
}
