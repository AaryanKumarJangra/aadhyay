import { can, type Grant, type PermissionKey } from '@aadhyay/contracts';

/** Icon names resolved by the shell's icon map (keeps navigation data serialisable). */
export type NavIcon =
  | 'dashboard' | 'students' | 'staff' | 'attendance' | 'exams' | 'subjects' | 'calendar' | 'fees' | 'feeHeads' | 'transport' | 'vehicles'
  | 'library' | 'inventory' | 'hostel' | 'frontOffice' | 'enquiries' | 'complaints' | 'alumni' | 'batches' | 'notices' | 'messenger'
  | 'crm' | 'website' | 'reports' | 'settings' | 'roles' | 'billing' | 'access';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  /** Visible if the user holds ANY of these (in any scope). Omit for items every member sees. */
  anyOf?: PermissionKey[];
  /** Visible only if this module is enabled for the institution. */
  module?: string;
  children?: NavItem[];
}
export interface NavGroup { key: string; label: string; items: NavItem[] }

/**
 * The institution console's navigation. Visibility = module enabled AND permission held. This is UX only: every page
 * re-checks on the server and every API call is authorised by the backend.
 */
export const NAV: NavGroup[] = [
  { key: 'overview', label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', href: '/app', icon: 'dashboard' }] },
  {
    key: 'people', label: 'People', items: [
      { key: 'students', label: 'Students', href: '/app/students', icon: 'students', module: 'people', anyOf: ['people.student.view'] },
      { key: 'staff', label: 'Staff & users', href: '/app/people/staff', icon: 'staff', module: 'people', anyOf: ['people.staff.view', 'org.member.view'] },
    ],
  },
  {
    key: 'academics', label: 'Academics', items: [
      { key: 'attendance', label: 'Attendance', href: '/app/attendance', icon: 'attendance', module: 'attendance', anyOf: ['attendance.student.view', 'attendance.student.create'] },
      { key: 'exams', label: 'Exams & results', href: '/app/exams', icon: 'exams', module: 'exams', anyOf: ['exams.exam.view', 'exams.marks.view', 'exams.marks.create'] },
      { key: 'subjects', label: 'Subjects', href: '/app/r/subjects', icon: 'subjects', module: 'academics', anyOf: ['academics.subject.edit'] },
      { key: 'calendar', label: 'Calendar', href: '/app/r/events', icon: 'calendar', module: 'calendar', anyOf: ['calendar.event.create'] },
    ],
  },
  {
    key: 'finance', label: 'Finance', items: [
      { key: 'fees', label: 'Fees', href: '/app/fees', icon: 'fees', module: 'fees', anyOf: ['fees.dashboard.view', 'fees.payment.view', 'fees.payment.create'] },
      { key: 'fee-heads', label: 'Fee heads', href: '/app/r/fee-heads', icon: 'feeHeads', module: 'fees', anyOf: ['fees.structure.edit'] },
    ],
  },
  {
    key: 'operations', label: 'Operations', items: [
      { key: 'transport', label: 'Transport', href: '/app/transport', icon: 'transport', module: 'transport', anyOf: ['transport.trip.manage', 'transport.route.view'] },
      { key: 'vehicles', label: 'Vehicles', href: '/app/r/vehicles', icon: 'vehicles', module: 'transport', anyOf: ['transport.vehicle.edit'] },
      { key: 'library', label: 'Library', href: '/app/r/books', icon: 'library', module: 'library', anyOf: ['library.book.view'] },
      { key: 'inventory', label: 'Inventory', href: '/app/r/items', icon: 'inventory', module: 'inventory', anyOf: ['inventory.item.view'] },
      { key: 'hostel', label: 'Hostel', href: '/app/r/hostels', icon: 'hostel', module: 'hostel', anyOf: ['hostel.hostel.view'] },
      { key: 'front-office', label: 'Visitor book', href: '/app/r/visitors', icon: 'frontOffice', module: 'front-office', anyOf: ['front-office.visitor.view'] },
      { key: 'enquiries', label: 'Enquiries', href: '/app/r/enquiries', icon: 'enquiries', module: 'front-office', anyOf: ['front-office.enquiry.view'] },
      { key: 'complaints', label: 'Complaints', href: '/app/r/complaints', icon: 'complaints', module: 'front-office', anyOf: ['front-office.complaint.view'] },
      { key: 'alumni', label: 'Alumni', href: '/app/r/alumni', icon: 'alumni', module: 'alumni', anyOf: ['alumni.alumni.view'] },
      { key: 'batches', label: 'Batches', href: '/app/r/batches', icon: 'batches', module: 'coaching', anyOf: ['coaching.batch.view'] },
    ],
  },
  {
    key: 'engage', label: 'Engage', items: [
      { key: 'notices', label: 'Notices', href: '/app/notices', icon: 'notices', module: 'comms', anyOf: ['comms.notice.create'] },
      { key: 'messenger', label: 'Messenger', href: '/app/messenger', icon: 'messenger' },
      { key: 'crm', label: 'Admissions CRM', href: '/app/crm', icon: 'crm', module: 'crm', anyOf: ['crm.lead.view'] },
      { key: 'website', label: 'Website', href: '/app/website', icon: 'website', module: 'cms', anyOf: ['cms.page.edit'] },
    ],
  },
  { key: 'insights', label: 'Insights', items: [{ key: 'reports', label: 'Reports', href: '/app/reports', icon: 'reports', module: 'reports', anyOf: ['reports.dashboard.view', 'reports.attendance.view', 'reports.fees.view'] }] },
  {
    key: 'admin', label: 'Administration', items: [
      { key: 'settings', label: 'Settings', href: '/app/settings', icon: 'settings', anyOf: ['org.settings.view'] },
      { key: 'roles', label: 'Roles & permissions', href: '/app/settings/roles', icon: 'roles', anyOf: ['org.role.view'] },
      { key: 'billing', label: 'Plan & billing', href: '/app/billing', icon: 'billing', anyOf: ['org.billing.view'] },
      { key: 'access', label: 'My access', href: '/app/access', icon: 'access' },
    ],
  },
];

export interface AccessSnapshot { grants: Pick<Grant, 'pattern' | 'scope' | 'conditions' | 'source'>[]; modules: string[] }

export function itemVisible(item: NavItem, a: AccessSnapshot): boolean {
  if (item.module && !a.modules.includes(item.module)) return false;
  if (!item.anyOf?.length) return true;
  return item.anyOf.some((k) => can(a as Parameters<typeof can>[0], k));
}

/** Navigation filtered for this user; empty groups disappear. */
export function visibleNav(a: AccessSnapshot): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => itemVisible(i, a)).map((i) => ({ ...i, children: i.children?.filter((c) => itemVisible(c, a)) })) })).filter((g) => g.items.length);
}

export function findNav(path: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV) for (const item of group.items) {
    const hit = item.href === '/app' ? path === '/app' : path === item.href || path.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.item.href.length)) best = { group, item };
  }
  return best;
}
