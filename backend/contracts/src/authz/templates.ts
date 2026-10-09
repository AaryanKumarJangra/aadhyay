/**
 * Default role templates (docs/redesign/03-AUTHORIZATION.md §Templates). Each grant carries its scope and conditions.
 * Provisioning copies these into every new tenant as system roles; `TEMPLATE_VERSION` lets migrations upgrade system
 * roles the institution has not customised.
 */
import type { Conditions, ScopeLevel } from './catalogue';

export const TEMPLATE_VERSION = 3;

type GrantSpec = ScopeLevel | { scope: ScopeLevel; conditions: Conditions };
export interface RoleTemplate {
  name: string;
  description: string;
  /** Membership kind this role is meant for (drives defaults in the invite screen). */
  kind: 'staff' | 'guardian' | 'student';
  /** Permission (or wildcard pattern) → scope / conditions. */
  grants: Record<string, GrantSpec>;
}

const all = (...patterns: string[]): Record<string, GrantSpec> => Object.fromEntries(patterns.map((p) => [p, 'tenant' as const]));
const sec = (...patterns: string[]): Record<string, GrantSpec> => Object.fromEntries(patterns.map((p) => [p, 'section' as const]));

const REFERENCE_READ = all('academics.class.view', 'academics.subject.view', 'timetable.slot.view', 'calendar.event.view', 'comms.notice.view');

export const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  owner: { name: 'Owner / Director', kind: 'staff', description: 'Full control of the institution, including roles, billing and data export.', grants: all('*') },
  principal: {
    name: 'Principal', kind: 'staff',
    description: 'Runs academics and staff day to day. Sees fee summaries but cannot collect or refund. Assigns staff to existing roles.',
    grants: {
      ...all('org.settings.view', 'org.session.*', 'org.branch.view', 'org.role.view', 'org.member.view', 'org.member.create', 'org.member.edit', 'org.audit.view'),
      ...all('people.*', 'academics.*', 'timetable.*', 'calendar.*', 'attendance.*', 'homework.*', 'lessonplan.*', 'exams.*', 'online-exams.*', 'lms.*', 'live-classes.*'),
      ...all('fees.dashboard.view', 'fees.report.view', 'fees.structure.view', 'fees.payment.view'),
      'fees.discount.approve': { scope: 'tenant', conditions: { maxAmountPaise: 2_500_000 } },
      ...all('hr.leave.view', 'hr.leave.approve', 'behaviour.*', 'health.record.view', 'certificates.*', 'front-office.*', 'crm.*', 'transport.*', 'hostel.*', 'library.book.view'),
      ...all('comms.*', 'cms.*', 'reports.*', 'compliance.dpdp.view', 'alumni.*'),
    },
  },
  admin: {
    name: 'Institution Admin', kind: 'staff',
    description: 'Office administration: admissions, records, front office, transport and the website. No academic approvals, fees refunds or role design.',
    grants: {
      ...all('org.settings.*', 'org.customfield.*', 'org.branch.*', 'org.session.*', 'org.role.view', 'org.member.view', 'org.member.create', 'org.member.edit'),
      ...all('people.*', 'academics.*', 'timetable.*', 'calendar.*', 'attendance.student.view', 'attendance.staff.*', 'attendance.device.manage'),
      ...all('front-office.*', 'crm.*', 'transport.*', 'comms.*', 'cms.*', 'library.*', 'inventory.*', 'hostel.*', 'certificates.*', 'fees.dashboard.view', 'reports.dashboard.view', 'reports.attendance.view'),
    },
  },
  coordinator: {
    name: 'Coordinator / HOD', kind: 'staff',
    description: 'Oversees assigned classes: attendance, homework, marks and leave for those sections.',
    grants: {
      ...REFERENCE_READ,
      ...sec('people.student.view', 'people.guardian.view', 'attendance.student.view', 'attendance.student.create', 'attendance.student.edit', 'attendance.student.export', 'attendance.leave.view', 'attendance.leave.approve'),
      ...sec('homework.assignment.view', 'homework.assignment.create', 'homework.assignment.edit', 'homework.diary.create', 'exams.marks.view', 'exams.result.view', 'reports.attendance.view', 'behaviour.incident.view', 'behaviour.incident.create', 'comms.notice.create'),
      ...all('exams.exam.view', 'lessonplan.*'),
      'attendance.leave.create': 'own',
    },
  },
  teacher: {
    name: 'Teacher', kind: 'staff',
    description: 'Marks attendance, sets homework and enters marks for the classes and subjects they teach.',
    grants: {
      ...REFERENCE_READ,
      ...sec('people.student.view', 'people.guardian.view', 'attendance.student.view', 'attendance.student.create', 'attendance.leave.view', 'homework.assignment.view', 'homework.assignment.create', 'homework.assignment.edit', 'homework.diary.create'),
      ...sec('exams.result.view', 'behaviour.incident.view', 'behaviour.incident.create', 'comms.notice.create', 'reports.attendance.view'),
      'attendance.student.edit': { scope: 'section', conditions: { sameDayOnly: true } },
      'exams.marks.view': 'subject', 'exams.marks.create': 'subject', 'exams.marks.edit': 'subject',
      'attendance.leave.create': 'own',
      ...all('exams.exam.view', 'lessonplan.*', 'lms.*', 'online-exams.*', 'live-classes.*', 'library.book.view'),
    },
  },
  exam_controller: {
    name: 'Exam Controller', kind: 'staff',
    description: 'Schedules exams, moderates marks, computes and publishes results for the whole institution.',
    grants: { ...REFERENCE_READ, ...all('exams.*', 'online-exams.*', 'people.student.view', 'reports.attendance.view', 'certificates.certificate.print'), 'attendance.leave.create': 'own' },
  },
  accountant: {
    name: 'Accountant', kind: 'staff',
    description: 'Collects fees, issues receipts and runs accounts. Refunds above ₹10,000 and receipt cancellations need a second approver.',
    grants: {
      ...all('fees.structure.*', 'fees.discount.view', 'fees.discount.create', 'fees.discount.edit', 'fees.payment.view', 'fees.payment.create', 'fees.payment.export', 'fees.report.view', 'fees.dashboard.view', 'fees.settings.manage'),
      'fees.discount.approve': { scope: 'tenant', conditions: { maxAmountPaise: 1_000_000 } },
      'fees.payment.refund': { scope: 'tenant', conditions: { maxAmountPaise: 1_000_000, makerChecker: true } },
      'fees.payment.delete': { scope: 'tenant', conditions: { makerChecker: true } },
      ...all('accounts.*', 'payroll.run.view', 'payroll.run.export', 'people.student.view', 'people.guardian.view', 'people.contact.view', 'reports.fees.view', 'comms.notice.view'),
      'attendance.leave.create': 'own',
    },
  },
  front_office: {
    name: 'Counsellor / Front Office', kind: 'staff',
    description: 'Handles enquiries, visitors and the admissions pipeline; can start an admission.',
    grants: { ...all('front-office.*', 'crm.*', 'people.student.view', 'people.student.create', 'people.guardian.view', 'people.guardian.create', 'people.contact.view', 'calendar.event.view', 'comms.notice.view'), 'attendance.leave.create': 'own' },
  },
  hr_manager: {
    name: 'HR Manager', kind: 'staff',
    description: 'Staff records, staff attendance, leave and payroll.',
    grants: { ...all('hr.*', 'payroll.*', 'attendance.staff.*', 'people.staff.*', 'org.member.view', 'comms.notice.view'), 'attendance.leave.create': 'own' },
  },
  librarian: {
    name: 'Librarian', kind: 'staff', description: 'Catalogue, issue and return, fines.',
    grants: { ...all('library.*', 'people.student.view', 'people.staff.view', 'comms.notice.view'), 'attendance.leave.create': 'own' },
  },
  store_keeper: { name: 'Store Keeper', kind: 'staff', description: 'Inventory items, suppliers and stock.', grants: { ...all('inventory.*', 'comms.notice.view'), 'attendance.leave.create': 'own' } },
  warden: {
    name: 'Warden', kind: 'staff', description: 'Hostel rooms, allocations, outpasses and residents’ health.',
    grants: { ...all('hostel.*', 'people.student.view', 'people.contact.view', 'health.*', 'comms.notice.view'), 'attendance.leave.create': 'own' },
  },
  transport_manager: {
    name: 'Transport Manager', kind: 'staff', description: 'Routes, vehicles, assignments and every live trip.',
    grants: { ...all('transport.*', 'people.student.view', 'people.contact.view', 'comms.notice.view'), 'attendance.leave.create': 'own' },
  },
  driver: {
    name: 'Driver / Attendant', kind: 'staff', description: 'Runs trips only on the vehicle they are assigned to. No access to academic or personal records.',
    grants: { 'transport.trip.view': 'own', 'transport.trip.create': 'own', 'attendance.leave.create': 'own' },
  },
  web_author: {
    name: 'Website Author', kind: 'staff', description: 'Writes and edits website pages and news as drafts and submits them for review. Cannot publish.',
    grants: { ...all('cms.page.view', 'cms.page.create', 'cms.page.edit', 'cms.post.view', 'cms.post.create', 'cms.post.edit', 'comms.notice.view'), 'attendance.leave.create': 'own' },
  },
  web_publisher: {
    name: 'Website Publisher', kind: 'staff', description: 'Reviews drafts, requests changes and publishes the website, menus and news.',
    grants: { ...all('cms.page.*', 'cms.post.*', 'cms.menu.edit', 'cms.domain.view', 'comms.notice.view'), 'attendance.leave.create': 'own' },
  },
  student: { name: 'Student', kind: 'student', description: 'Their own attendance, timetable, homework, results, fees and notices.', grants: { 'self.*': 'own' } },
  guardian: { name: 'Parent / Guardian', kind: 'guardian', description: 'Their own children’s attendance, homework, fees, results, bus and notices. Can apply for leave and pay fees.', grants: { 'self.*': 'own' } },
};

export interface MaterialisedRole { permissions: string[]; scopes: Record<string, ScopeLevel>; conditions: Record<string, Conditions> }

/** Splits a template into the three role columns stored in the database. */
export function materialise(t: Pick<RoleTemplate, 'grants'>): MaterialisedRole {
  const permissions: string[] = [];
  const scopes: Record<string, ScopeLevel> = {};
  const conditions: Record<string, Conditions> = {};
  for (const [k, spec] of Object.entries(t.grants)) {
    permissions.push(k);
    if (typeof spec === 'string') scopes[k] = spec;
    else { scopes[k] = spec.scope; conditions[k] = spec.conditions; }
  }
  return { permissions, scopes, conditions };
}
