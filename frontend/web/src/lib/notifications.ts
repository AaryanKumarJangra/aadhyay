/** Notification categories and deep links, derived from the event key (brief §14, §63). */
export type NoticeCategory = 'academic' | 'attendance' | 'fees' | 'transport' | 'communication' | 'system';

export const CATEGORY_LABEL: Record<NoticeCategory, string> = {
  academic: 'Academic', attendance: 'Attendance', fees: 'Fees', transport: 'Transport', communication: 'Communication', system: 'System',
};

export function categoryOf(eventKey: string): NoticeCategory {
  if (eventKey.startsWith('attendance.') || eventKey.startsWith('leave.')) return 'attendance';
  if (eventKey.startsWith('fee.') || eventKey.startsWith('invoice.') || eventKey.startsWith('wallet.') || eventKey.startsWith('billing.')) return 'fees';
  if (eventKey.startsWith('trip.') || eventKey.startsWith('transport.')) return 'transport';
  if (eventKey.startsWith('exam.') || eventKey.startsWith('homework.') || eventKey.startsWith('diary.') || eventKey.startsWith('ptm.')) return 'academic';
  if (eventKey.startsWith('notice.') || eventKey.startsWith('emergency.')) return 'communication';
  return 'system';
}

/** Where tapping a notification goes: the exact object when the payload identifies it. */
export function deepLink(n: { eventKey: string; studentId?: string | null; data?: Record<string, any> | null }): string {
  const d = n.data ?? {};
  const sid = n.studentId ?? d.studentId;
  switch (categoryOf(n.eventKey)) {
    case 'attendance': return n.eventKey.startsWith('leave.') ? '/app/attendance?tab=leave' : sid ? `/app/students/${sid}?tab=attendance` : '/app/attendance';
    case 'fees': return n.eventKey.startsWith('wallet.') || n.eventKey.startsWith('billing.') || n.eventKey.startsWith('invoice.') ? '/app/billing' : sid ? `/app/students/${sid}?tab=fees` : '/app/fees';
    case 'transport': return d.token ? `/track/${d.token}` : '/app/transport';
    case 'academic': return n.eventKey.startsWith('exam.') ? (sid ? `/app/students/${sid}?tab=exams` : '/app/exams') : sid ? `/app/students/${sid}?tab=homework` : '/app';
    case 'communication': return '/app/notices';
    default: return '/app';
  }
}
