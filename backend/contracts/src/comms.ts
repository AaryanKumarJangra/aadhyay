import { z } from 'zod';

export const CHANNELS = ['push', 'inbox', 'messenger', 'whatsapp', 'sms', 'email'] as const;
export const routingChannels = z.object({
  push: z.boolean().default(true),
  whatsapp: z.enum(['never', 'always', 'fallback']).default('never'),
  sms: z.enum(['never', 'fallback', 'always']).default('never'),
  email: z.boolean().default(false),
  fallbackInactiveDays: z.number().int().min(1).max(60).default(7),
});
export type RoutingChannels = z.infer<typeof routingChannels>;

/** Default routing policy — docs/01 §7.2 and docs/03 §4. Tenants may override per event. */
export const DEFAULT_ROUTING: Record<string, RoutingChannels> = {
  'attendance.absent': { push: true, whatsapp: 'fallback', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'attendance.late': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'attendance.marked': { push: false, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'homework.assigned': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'diary.posted': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'notice.published': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'fee.due_soon': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'fee.overdue': { push: true, whatsapp: 'always', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'fee.paid': { push: true, whatsapp: 'never', sms: 'never', email: true, fallbackInactiveDays: 7 },
  'exam.result_published': { push: true, whatsapp: 'always', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'trip.started': { push: true, whatsapp: 'fallback', sms: 'never', email: false, fallbackInactiveDays: 3 },
  'trip.near_stop': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'trip.boarded': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'trip.dropped': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'transport.sos': { push: true, whatsapp: 'always', sms: 'fallback', email: false, fallbackInactiveDays: 7 },
  'emergency.broadcast': { push: true, whatsapp: 'always', sms: 'fallback', email: false, fallbackInactiveDays: 7 },
  'ptm.scheduled': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
  'leave.decided': { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 },
};
export const URGENT_EVENTS = new Set(['transport.sos', 'emergency.broadcast', 'auth.otp']);

export const noticeInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  audience: z.object({
    all: z.boolean().optional(),
    classIds: z.array(z.string().uuid()).optional(),
    sectionIds: z.array(z.string().uuid()).optional(),
    guardians: z.boolean().optional(),
    students: z.boolean().optional(),
    staff: z.boolean().optional(),
  }),
  attachments: z.array(z.string().uuid()).default([]),
  publishAt: z.string().datetime().optional(),
  urgent: z.boolean().default(false),
});
export const templateInput = z.object({
  eventKey: z.string(), channel: z.enum(CHANNELS), locale: z.string().default('en'),
  title: z.string().optional(), body: z.string().min(1), waTemplateName: z.string().optional(),
});
export const routingUpdate = z.object({ eventKey: z.string(), channels: routingChannels });
export const pushTokenInput = z.object({ deviceId: z.string(), token: z.string(), platform: z.enum(['android', 'ios', 'web']), appId: z.string().default('aadhyay') });
