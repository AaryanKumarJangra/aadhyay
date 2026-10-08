/**
 * Permission format: module.resource.action  (actions: view | create | edit | delete | approve | export | print | manage)
 * Wildcards: "*" (all), "fees.*" (whole module), "fees.payment.*" (all actions on a resource).
 */
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print', 'manage'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Segment-wise match. "*" in the middle stands for exactly one segment ("fees.*.view" grants "fees.receipt.view"
 * but not "fees.receipt.edit"); a trailing "*" stands for one or more segments ("fees.*" grants everything in fees).
 */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  const g = granted.split('.'), r = required.split('.');
  for (let i = 0; i < g.length; i++) {
    const last = i === g.length - 1;
    if (g[i] === '*') {
      if (last) return r.length > i; // trailing wildcard: needs at least one more segment
      if (r[i] === undefined) return false;
      continue;
    }
    if (g[i] !== r[i]) return false;
  }
  return g.length === r.length;
}

export function hasPermission(granted: Iterable<string>, required: string): boolean {
  for (const g of granted) if (permissionMatches(g, required)) return true;
  return false;
}

/** Default role templates (docs/03 §2.2). Segment packs relabel names but keep keys. */
export const ROLE_TEMPLATES: Record<string, { name: string; permissions: string[] }> = {
  owner: { name: 'Owner / Director', permissions: ['*'] },
  principal: {
    name: 'Principal',
    permissions: [
      'org.*', 'people.*', 'academics.*', 'timetable.*', 'calendar.*', 'attendance.*', 'homework.*', 'lessonplan.*',
      'exams.*', 'board-exams.*', 'online-exams.*', 'lms.*', 'live-classes.*', 'fees.*.view', 'fees.discount.approve',
      'hr.*', 'behaviour.*', 'certificates.*', 'front-office.*', 'crm.*', 'transport.*', 'hostel.*', 'library.view',
      'comms.*', 'cms.*', 'reports.*', 'compliance.*', 'alumni.*',
    ],
  },
  admin: { name: 'Institution Admin', permissions: ['*'] },
  accountant: {
    name: 'Accountant',
    permissions: ['fees.*', 'accounts.*', 'payroll.*', 'people.student.view', 'people.guardian.view', 'reports.fees.*', 'transport.fee.*'],
  },
  front_office: {
    name: 'Front Office / Counsellor',
    permissions: ['front-office.*', 'crm.*', 'people.student.view', 'people.student.create', 'people.guardian.*', 'calendar.event.view'],
  },
  teacher: {
    name: 'Teacher',
    permissions: [
      'attendance.student.*', 'homework.*', 'lessonplan.*', 'exams.marks.*', 'exams.exam.view', 'online-exams.*',
      'lms.*', 'live-classes.*', 'people.student.view', 'people.guardian.view', 'academics.*.view', 'timetable.*.view',
      'calendar.event.view', 'comms.notice.create', 'comms.notice.view', 'behaviour.incident.*', 'library.book.view',
    ],
  },
  hr_manager: { name: 'HR Manager', permissions: ['hr.*', 'payroll.*', 'attendance.staff.*', 'people.staff.*'] },
  librarian: { name: 'Librarian', permissions: ['library.*', 'people.student.view', 'people.staff.view'] },
  store_keeper: { name: 'Store Keeper', permissions: ['inventory.*'] },
  warden: { name: 'Warden', permissions: ['hostel.*', 'people.student.view', 'health.*'] },
  transport_manager: { name: 'Transport Manager', permissions: ['transport.*', 'people.student.view'] },
  driver: { name: 'Driver / Attendant', permissions: ['transport.trip.create', 'transport.trip.view', 'transport.vehicle.view'] },
  student: { name: 'Student', permissions: ['self.*'] },
  guardian: { name: 'Parent / Guardian', permissions: ['self.*'] },
};
