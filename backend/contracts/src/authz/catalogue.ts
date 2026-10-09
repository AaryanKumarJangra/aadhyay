/**
 * Permission catalogue — the single source of truth for every permission key (docs/redesign/03-AUTHORIZATION.md).
 *
 * Key format: module.resource.action. Every key used by `@Can`, navigation, mobile or role templates must exist here;
 * `PermissionKey` is derived from this object, so an unknown key is a compile error.
 *
 * `scopes` lists only the scopes the backend actually enforces for that permission. The role editor offers exactly
 * these, so the UI never promises a restriction the API cannot keep.
 */

/** Ordered broad → narrow. */
export const SCOPE_LEVELS = ['tenant', 'section', 'subject', 'own'] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

export const SCOPE_LABEL: Record<ScopeLevel, string> = {
  tenant: 'Entire institution',
  section: 'Assigned classes & sections',
  subject: 'Assigned subjects',
  own: 'Own records only',
};

export type ConditionKey = 'maxAmountPaise' | 'sameDayOnly' | 'makerChecker';
export interface Conditions {
  /** Upper limit for money actions (refunds, discounts), in paise. */
  maxAmountPaise?: number;
  /** Only records dated today (in the institution's timezone). */
  sameDayOnly?: boolean;
  /** The action is recorded as a request and a second person with the same permission must approve it. */
  makerChecker?: boolean;
}

export interface ActionDef {
  /** Verb phrase used in sentences: "Can <phrase> for assigned sections". */
  phrase: string;
  scopes?: readonly ScopeLevel[];
  conditions?: readonly ConditionKey[];
  /** Exposes personal / financial / health data; shown with a warning in the role editor. */
  sensitive?: boolean;
}
export interface ResourceDef { label: string; actions: Record<string, ActionDef> }
export interface ModuleDef { label: string; resources: Record<string, ResourceDef> }

const T = ['tenant'] as const;
const TS = ['tenant', 'section'] as const;
const TSO = ['tenant', 'section', 'own'] as const;
const TO = ['tenant', 'own'] as const;
const TSUB = ['tenant', 'section', 'subject'] as const;

/** Standard CRUD actions for a resource ("books" → view/add/edit/delete books). Extra actions are spread at the call site. */
function crud(noun: string, scopes: readonly ScopeLevel[] = T) {
  return {
    view: { phrase: `view ${noun}`, scopes },
    create: { phrase: `add ${noun}`, scopes },
    edit: { phrase: `edit ${noun}`, scopes },
    delete: { phrase: `delete ${noun}`, scopes },
  };
}

export const CATALOGUE = {
  org: {
    label: 'Institution',
    resources: {
      settings: { label: 'Settings', actions: { view: { phrase: 'view institution settings' }, edit: { phrase: 'change institution settings and branding' } } },
      customfield: { label: 'Custom fields', actions: crud('custom fields') },
      branch: { label: 'Branches', actions: crud('branches') },
      session: { label: 'Academic years', actions: { view: { phrase: 'view academic years' }, create: { phrase: 'create academic years' }, edit: { phrase: 'change the current academic year' } } },
      role: { label: 'Roles & permissions', actions: { view: { phrase: 'view roles and permissions' }, create: { phrase: 'create custom roles' }, edit: { phrase: 'change role permissions' }, delete: { phrase: 'delete custom roles' } } },
      member: { label: 'Users & logins', actions: { view: { phrase: 'view users and their access' }, create: { phrase: 'invite users' }, edit: { phrase: 'assign roles and scopes to users' }, delete: { phrase: 'deactivate users' } } },
      billing: { label: 'Subscription & billing', actions: { view: { phrase: 'view the subscription and invoices' }, manage: { phrase: 'pay invoices and change the plan' } } },
      audit: { label: 'Audit log', actions: { view: { phrase: 'view the audit log', sensitive: true } } },
    },
  },
  people: {
    label: 'People',
    resources: {
      student: { label: 'Students', actions: { view: { phrase: 'view student profiles', scopes: TSO }, create: { phrase: 'admit students' }, edit: { phrase: 'edit student profiles' }, delete: { phrase: 'delete students' }, export: { phrase: 'export student lists' } } },
      sensitive: { label: 'Sensitive student data', actions: { view: { phrase: 'view religion, category, ID numbers and address', scopes: TS, sensitive: true } } },
      guardian: { label: 'Parents & guardians', actions: { view: { phrase: 'view parents and guardians', scopes: TS }, create: { phrase: 'add parents and guardians' } } },
      contact: { label: 'Phone numbers & emails', actions: { view: { phrase: 'see phone numbers and email addresses', scopes: TS, sensitive: true } } },
      document: { label: 'Personal documents', actions: crud('personal documents', T) },
      staff: { label: 'Staff', actions: crud('staff records') },
    },
  },
  academics: {
    label: 'Academics',
    resources: {
      class: { label: 'Classes & sections', actions: crud('classes and sections') },
      subject: { label: 'Subjects', actions: crud('subjects and subject teachers') },
      enrollment: { label: 'Enrolment', actions: { create: { phrase: 'enrol students in sections' }, edit: { phrase: 'move students between sections' } } },
      promotion: { label: 'Promotion', actions: { manage: { phrase: 'promote students to the next class' } } },
    },
  },
  timetable: { label: 'Timetable', resources: { slot: { label: 'Timetable', actions: crud('the timetable') } } },
  calendar: { label: 'Calendar', resources: { event: { label: 'Events & holidays', actions: crud('calendar events') } } },
  attendance: {
    label: 'Attendance',
    resources: {
      student: {
        label: 'Student attendance',
        actions: {
          view: { phrase: 'view student attendance', scopes: TSO },
          create: { phrase: 'mark attendance', scopes: TS },
          edit: { phrase: 'change attendance already marked', scopes: TS, conditions: ['sameDayOnly'] },
          approve: { phrase: 'approve attendance corrections', scopes: T },
          export: { phrase: 'export attendance reports', scopes: TS },
        },
      },
      staff: { label: 'Staff attendance', actions: { view: { phrase: 'view staff attendance' }, create: { phrase: 'mark staff attendance' } } },
      leave: { label: 'Leave requests', actions: { view: { phrase: 'view leave requests', scopes: TSO }, create: { phrase: 'apply for leave', scopes: TO }, approve: { phrase: 'approve or reject leave', scopes: TS } } },
      device: { label: 'Attendance devices', actions: { manage: { phrase: 'register QR/RFID/biometric devices' } } },
      settings: { label: 'Attendance settings', actions: { manage: { phrase: 'change attendance settings' } } },
    },
  },
  homework: {
    label: 'Homework',
    resources: {
      assignment: { label: 'Homework', actions: crud('homework', TS) },
      diary: { label: 'Class diary', actions: { create: { phrase: 'write the class diary', scopes: TS } } },
    },
  },
  lessonplan: { label: 'Lesson plans', resources: { lesson: { label: 'Lessons', actions: crud('lessons') }, topic: { label: 'Topics', actions: crud('topics') } } },
  exams: {
    label: 'Exams',
    resources: {
      exam: { label: 'Exams & schedules', actions: { ...crud('exams and schedules'), approve: { phrase: 'approve exam results' } } },
      marks: { label: 'Marks entry', actions: { view: { phrase: 'view marks', scopes: TSUB }, create: { phrase: 'enter marks', scopes: TSUB }, edit: { phrase: 'change marks', scopes: TSUB } } },
      result: { label: 'Results', actions: { view: { phrase: 'view results', scopes: TS }, manage: { phrase: 'compute results and ranks' }, publish: { phrase: 'publish results to parents' } } },
    },
  },
  'online-exams': { label: 'Online tests', resources: { bank: { label: 'Question banks', actions: crud('question banks') }, test: { label: 'Tests & attempts', actions: crud('online tests') } } },
  lms: { label: 'Courses (LMS)', resources: { course: { label: 'Courses', actions: crud('courses') } } },
  'live-classes': { label: 'Live classes', resources: { session: { label: 'Live sessions', actions: crud('live classes') } } },
  fees: {
    label: 'Fees',
    resources: {
      structure: { label: 'Fee structures', actions: crud('fee structures') },
      discount: { label: 'Concessions', actions: { ...crud('concession types'), approve: { phrase: 'grant concessions', conditions: ['maxAmountPaise'] } } },
      payment: {
        label: 'Collections & receipts',
        actions: {
          view: { phrase: 'view fee collections and ledgers', sensitive: true },
          create: { phrase: 'collect fees and issue receipts' },
          delete: { phrase: 'cancel receipts', conditions: ['makerChecker'] },
          approve: { phrase: 'approve receipt cancellations' },
          refund: { phrase: 'issue fee refunds', conditions: ['maxAmountPaise', 'makerChecker'] },
          export: { phrase: 'export fee data', sensitive: true },
        },
      },
      report: { label: 'Fee reports', actions: { view: { phrase: 'view fee reports and defaulters', sensitive: true } } },
      dashboard: { label: 'Fee dashboard', actions: { view: { phrase: 'view the fee dashboard' } } },
      settings: { label: 'Payment gateway', actions: { manage: { phrase: 'configure online payments' } } },
    },
  },
  accounts: {
    label: 'Accounts',
    resources: {
      journal: { label: 'Ledgers & journals', actions: crud('ledger accounts and journals') },
      voucher: { label: 'Income & expense', actions: crud('vouchers') },
      report: { label: 'Financial reports', actions: { view: { phrase: 'view financial statements' }, export: { phrase: 'export financial statements' } } },
    },
  },
  hr: { label: 'HR', resources: { leave: { label: 'Staff leave', actions: { ...crud('leave types'), approve: { phrase: 'approve staff leave' }, manage: { phrase: 'manage leave balances' } } } } },
  payroll: {
    label: 'Payroll',
    resources: {
      run: { label: 'Payroll runs', actions: { ...crud('payroll runs'), approve: { phrase: 'approve payroll' }, export: { phrase: 'export bank transfer files', sensitive: true } } },
      salary: { label: 'Salaries', actions: { view: { phrase: 'view salaries', sensitive: true }, edit: { phrase: 'change salary structures', sensitive: true } } },
    },
  },
  behaviour: { label: 'Behaviour', resources: { incident: { label: 'Incidents', actions: { view: { phrase: 'view behaviour records', scopes: TS, sensitive: true }, create: { phrase: 'record behaviour incidents', scopes: TS }, edit: { phrase: 'edit behaviour records' }, delete: { phrase: 'delete behaviour records' } } } } },
  health: {
    label: 'Health',
    resources: {
      record: { label: 'Health records', actions: { view: { phrase: 'view health records', sensitive: true }, edit: { phrase: 'edit health records', sensitive: true } } },
      visit: { label: 'Infirmary visits', actions: crud('infirmary visits') },
    },
  },
  certificates: { label: 'Certificates', resources: { template: { label: 'Templates', actions: crud('certificate templates') }, certificate: { label: 'Certificates', actions: { ...crud('certificates'), print: { phrase: 'print certificates and ID cards' } } } } },
  'front-office': {
    label: 'Front office',
    resources: {
      enquiry: { label: 'Enquiries', actions: crud('enquiries') },
      visitor: { label: 'Visitor book', actions: crud('visitor entries') },
      call: { label: 'Call log', actions: crud('call logs') },
      postal: { label: 'Postal', actions: crud('postal records') },
      complaint: { label: 'Complaints', actions: crud('complaints') },
    },
  },
  crm: { label: 'Admissions CRM', resources: { lead: { label: 'Leads', actions: { view: { phrase: 'view admission leads' }, create: { phrase: 'add leads' }, edit: { phrase: 'move leads through the pipeline' } } }, campaign: { label: 'Campaigns', actions: crud('campaigns') }, report: { label: 'CRM reports', actions: { view: { phrase: 'view conversion reports' } } } } },
  transport: {
    label: 'Transport',
    resources: {
      route: { label: 'Routes & stops', actions: crud('routes and stops') },
      vehicle: { label: 'Vehicles', actions: crud('vehicles') },
      assignment: { label: 'Student assignment', actions: { create: { phrase: 'assign students to routes' } } },
      trip: { label: 'Trips', actions: { view: { phrase: 'view live trips', scopes: TO }, create: { phrase: 'run trips (start, stops, SOS, end)', scopes: TO }, manage: { phrase: 'manage every trip' } } },
    },
  },
  hostel: { label: 'Hostel', resources: { hostel: { label: 'Hostels & rooms', actions: crud('hostels and rooms') }, allocation: { label: 'Allocations', actions: crud('bed allocations') }, outpass: { label: 'Outpasses', actions: { ...crud('outpasses'), approve: { phrase: 'approve outpasses' } } } } },
  library: { label: 'Library', resources: { book: { label: 'Catalogue', actions: crud('books') }, issue: { label: 'Issue & return', actions: crud('book issues') } } },
  inventory: { label: 'Inventory', resources: { item: { label: 'Items & suppliers', actions: crud('items and suppliers') }, stock: { label: 'Stock movements', actions: crud('stock movements') } } },
  canteen: { label: 'Canteen', resources: { pos: { label: 'Point of sale', actions: { create: { phrase: 'sell at the canteen counter' } } } } },
  alumni: { label: 'Alumni', resources: { alumni: { label: 'Alumni', actions: crud('alumni records') } } },
  cms: {
    label: 'Website',
    resources: {
      page: { label: 'Pages', actions: { ...crud('website pages'), publish: { phrase: 'publish website pages' } } },
      post: { label: 'News & events', actions: crud('news, events and blog posts') },
      menu: { label: 'Menus', actions: { edit: { phrase: 'edit website menus' } } },
      domain: { label: 'Domains', actions: { view: { phrase: 'view website domains' }, manage: { phrase: 'connect custom domains' } } },
    },
  },
  comms: {
    label: 'Communication',
    resources: {
      notice: { label: 'Notices', actions: { view: { phrase: 'view notices' }, create: { phrase: 'send notices', scopes: TS } } },
      settings: { label: 'Channels & templates', actions: { view: { phrase: 'view message routing and templates' }, edit: { phrase: 'change message routing and templates' } } },
    },
  },
  whatsapp: {
    label: 'WhatsApp',
    resources: {
      account: { label: 'Account', actions: { view: { phrase: 'view the WhatsApp account' }, manage: { phrase: 'connect the WhatsApp account' } } },
      template: { label: 'Templates', actions: { view: { phrase: 'view WhatsApp templates' }, create: { phrase: 'create WhatsApp templates' }, edit: { phrase: 'edit WhatsApp templates' } } },
      flow: { label: 'Flows', actions: { view: { phrase: 'view WhatsApp flows' }, create: { phrase: 'create WhatsApp flows' }, edit: { phrase: 'edit WhatsApp flows' } } },
      inbox: { label: 'Inbox', actions: { view: { phrase: 'read the WhatsApp inbox', sensitive: true }, create: { phrase: 'reply in the WhatsApp inbox' } } },
    },
  },
  reports: {
    label: 'Reports',
    resources: {
      dashboard: { label: 'Institution dashboard', actions: { view: { phrase: 'view the institution dashboard' } } },
      attendance: { label: 'Attendance reports', actions: { view: { phrase: 'view attendance reports', scopes: TS } } },
      fees: { label: 'Fee reports', actions: { view: { phrase: 'view fee reports', sensitive: true } } },
      export: { label: 'Data export', actions: { export: { phrase: 'export institution data as CSV', sensitive: true } } },
    },
  },
  compliance: {
    label: 'Compliance',
    resources: {
      dpdp: { label: 'DPDP requests', actions: crud('data-protection requests') },
      consent: { label: 'Consents', actions: crud('consent records') },
      export: { label: 'Data portability', actions: { export: { phrase: 'export a person’s data', sensitive: true } } },
    },
  },
  ai: { label: 'AI assistant', resources: { copilot: { label: 'Copilot', actions: { create: { phrase: 'use the AI assistant' } } } } },
  multibranch: { label: 'Multi-branch', resources: { dashboard: { label: 'Group dashboard', actions: { view: { phrase: 'view the multi-branch dashboard' } } } } },
  coaching: { label: 'Coaching', resources: { batch: { label: 'Batches', actions: crud('batches') }, coupon: { label: 'Coupons', actions: crud('coupons') }, order: { label: 'Orders', actions: crud('course orders') } } },
  college: { label: 'College', resources: { programme: { label: 'Programmes', actions: crud('programmes') }, result: { label: 'Credit results', actions: crud('credit results') }, placement: { label: 'Placements', actions: crud('placements') } } },
} as const satisfies Record<string, ModuleDef>;

type Cat = typeof CATALOGUE;
export type CatalogueModule = keyof Cat;
type Res<M extends CatalogueModule> = Cat[M]['resources'];
type KeysOf<M extends CatalogueModule> = {
  [R in keyof Res<M> & string]: Res<M>[R] extends { actions: infer A } ? `${M}.${R}.${keyof A & string}` : never;
}[keyof Res<M> & string];

/**
 * Every grantable permission. `self.*` is the family/student portal grant: endpoints that accept it check ownership
 * themselves (own children / own record).
 */
export type PermissionKey = { [M in CatalogueModule]: KeysOf<M> }[CatalogueModule] | 'self.*';

export interface PermissionInfo extends ActionDef {
  key: PermissionKey;
  module: CatalogueModule | 'self';
  moduleLabel: string;
  resource: string;
  resourceLabel: string;
  action: string;
  scopes: readonly ScopeLevel[];
}

export const PERMISSIONS: PermissionInfo[] = [
  ...Object.entries(CATALOGUE).flatMap(([m, md]) =>
    Object.entries((md as ModuleDef).resources).flatMap(([r, rd]) =>
      Object.entries(rd.actions).map(([a, ad]) => ({
        ...ad,
        key: `${m}.${r}.${a}` as PermissionKey,
        module: m as CatalogueModule,
        moduleLabel: (md as ModuleDef).label,
        resource: r,
        resourceLabel: rd.label,
        action: a,
        scopes: ad.scopes ?? T,
      })),
    ),
  ),
  {
    key: 'self.*', module: 'self', moduleLabel: 'Family portal', resource: 'portal', resourceLabel: 'Own records', action: '*',
    phrase: "see their own (or their children's) attendance, homework, fees, results, transport and notices", scopes: ['own'],
  },
];

export const PERMISSION_INDEX: ReadonlyMap<string, PermissionInfo> = new Map(PERMISSIONS.map((p) => [p.key, p]));

export function isKnownPermission(key: string): key is PermissionKey {
  return PERMISSION_INDEX.has(key);
}

/** "module.resource" prefixes that have the given action, e.g. ResourcePrefix<'view'> includes 'library.book'. */
type PrefixOf<K, A extends string> = K extends `${infer P}.${A}` ? P : never;
export type ResourcePrefix<A extends string = 'view'> = PrefixOf<PermissionKey, A>;
