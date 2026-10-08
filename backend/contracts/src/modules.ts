/** Module keys — used by feature flags, plans, permissions and routes. Source: docs/03-PRODUCT-SPEC.md §3 */
export const MODULE_KEYS = [
  'org', 'people', 'academics', 'timetable', 'calendar', 'attendance', 'homework', 'lessonplan', 'exams',
  'board-exams', 'online-exams', 'lms', 'live-classes', 'fees', 'accounts', 'hr', 'payroll', 'behaviour',
  'certificates', 'front-office', 'crm', 'transport', 'hostel', 'library', 'inventory', 'health', 'canteen',
  'alumni', 'cv', 'cms', 'comms', 'messenger', 'calls', 'whatsapp', 'ai', 'voice-agent', 'reports',
  'compliance', 'multibranch', 'college', 'coaching',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Modules every tenant always has (cannot be disabled). */
export const CORE_MODULES: ModuleKey[] = ['org', 'people', 'academics', 'comms', 'messenger', 'calls'];

export const PLAN_MODULES: Record<string, ModuleKey[]> = {
  essential: [
    'org', 'people', 'academics', 'timetable', 'calendar', 'attendance', 'homework', 'exams', 'certificates',
    'fees', 'front-office', 'cms', 'comms', 'messenger', 'calls', 'reports', 'compliance',
  ],
  professional: [
    'org', 'people', 'academics', 'timetable', 'calendar', 'attendance', 'homework', 'exams', 'certificates',
    'fees', 'front-office', 'cms', 'comms', 'messenger', 'calls', 'reports', 'compliance', 'lessonplan',
    'board-exams', 'online-exams', 'lms', 'live-classes', 'accounts', 'hr', 'payroll', 'library', 'inventory',
    'behaviour', 'alumni', 'cv', 'crm', 'transport',
  ],
  enterprise: [...MODULE_KEYS.filter((m) => !['college', 'coaching', 'voice-agent', 'whatsapp', 'canteen', 'health'].includes(m))],
  creator_starter: ['org', 'people', 'lms', 'online-exams', 'fees', 'cms', 'comms', 'messenger', 'calls', 'certificates', 'coaching'],
  coaching_growth: [
    'org', 'people', 'academics', 'attendance', 'lms', 'online-exams', 'live-classes', 'fees', 'cms', 'comms',
    'messenger', 'calls', 'certificates', 'coaching', 'crm', 'reports',
  ],
  coaching_pro: [
    'org', 'people', 'academics', 'attendance', 'lms', 'online-exams', 'live-classes', 'fees', 'cms', 'comms',
    'messenger', 'calls', 'certificates', 'coaching', 'crm', 'reports', 'multibranch', 'ai',
  ],
};
