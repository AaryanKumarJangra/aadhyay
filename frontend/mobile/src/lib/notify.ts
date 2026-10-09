/** Notification categories and deep links (brief §14, §63): tap → the exact record. */
export type Category = 'academic' | 'attendance' | 'fees' | 'transport' | 'communication' | 'system';
export const CATEGORY_LABEL: Record<Category, string> = { academic: 'Academic', attendance: 'Attendance', fees: 'Fees', transport: 'Transport', communication: 'Notices', system: 'System' };
export const CATEGORY_ICON: Record<Category, 'book-open' | 'check-square' | 'credit-card' | 'truck' | 'volume-2' | 'settings'> = { academic: 'book-open', attendance: 'check-square', fees: 'credit-card', transport: 'truck', communication: 'volume-2', system: 'settings' };

export function categoryOf(eventKey: string): Category {
  if (/^(attendance|leave)\./.test(eventKey)) return 'attendance';
  if (/^(fee|invoice|wallet|billing)\./.test(eventKey)) return 'fees';
  if (/^(trip|transport)\./.test(eventKey)) return 'transport';
  if (/^(exam|homework|diary|ptm)\./.test(eventKey)) return 'academic';
  if (/^(notice|emergency)\./.test(eventKey)) return 'communication';
  return 'system';
}

/** expo-router path for a notification payload. */
export function routeFor(n: { eventKey?: string; studentId?: string | null; data?: Record<string, any> | null }): string {
  const key = n.eventKey ?? '';
  const sid = n.studentId || n.data?.studentId;
  switch (categoryOf(key)) {
    case 'attendance': return key.startsWith('leave.') ? '/(tabs)/work' : sid ? `/child/${sid}?tab=attendance` : '/(tabs)/work';
    case 'fees': return sid ? `/child/${sid}?tab=fees` : '/(tabs)/notifications';
    case 'academic': return sid ? `/child/${sid}?tab=${key.startsWith('exam.') ? 'results' : 'homework'}` : '/(tabs)/notifications';
    case 'transport': return '/parent/bus';
    default: return '/(tabs)/notifications';
  }
}
