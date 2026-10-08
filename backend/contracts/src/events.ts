/** Domain event names (outbox `type`). Source: docs/04 §4 */
export const EVENTS = [
  'tenant.created', 'tenant.status_changed', 'user.registered', 'student.admitted', 'student.updated',
  'guardian.linked', 'attendance.marked', 'attendance.absent', 'attendance.late', 'leave.requested', 'leave.decided',
  'homework.assigned', 'diary.posted', 'notice.published', 'exam.result_published', 'fee.assigned', 'fee.due_soon',
  'fee.overdue', 'fee.paid', 'fee.refunded', 'trip.started', 'trip.near_stop', 'trip.boarded', 'trip.dropped',
  'trip.ended', 'transport.sos', 'emergency.broadcast', 'lead.created', 'lead.stage_changed', 'cms.page_published',
  'wa.message_status', 'wa.inbound', 'invoice.issued', 'invoice.paid', 'wallet.low', 'messenger.invite_fulfilled',
  'ptm.scheduled', 'billing.renewal_due', 'auth.otp', 'comms.deliver',
] as const;
export type EventType = (typeof EVENTS)[number];

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  type: EventType;
  tenantId: string | null;
  occurredAt: string;
  actorUserId?: string | null;
  data: T;
}
