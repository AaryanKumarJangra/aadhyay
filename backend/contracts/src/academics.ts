import { z } from 'zod';
import { isoDate } from './common';

export const classInput = z.object({ name: z.string().min(1), order: z.number().int().default(0), sections: z.array(z.string()).default(['A']) });
export const sectionInput = z.object({ classId: z.string().uuid(), name: z.string().min(1), classTeacherId: z.string().uuid().optional(), capacity: z.number().int().optional() });
export const subjectInput = z.object({ name: z.string().min(1), code: z.string().optional(), type: z.enum(['theory', 'practical', 'co_scholastic']).default('theory') });
export const classSubjectInput = z.object({ classId: z.string().uuid(), sectionId: z.string().uuid().optional(), subjectId: z.string().uuid(), teacherId: z.string().uuid().optional() });
export const enrollInput = z.object({ studentId: z.string().uuid(), sectionId: z.string().uuid(), rollNo: z.string().optional(), sessionId: z.string().uuid().optional() });
export const promoteInput = z.object({
  fromSessionId: z.string().uuid(),
  toSessionId: z.string().uuid(),
  mappings: z.array(z.object({ fromSectionId: z.string().uuid(), toSectionId: z.string().uuid() })),
  detainStudentIds: z.array(z.string().uuid()).default([]),
});
export const periodInput = z.object({ name: z.string(), startsAt: z.string().regex(/^\d{2}:\d{2}$/), endsAt: z.string().regex(/^\d{2}:\d{2}$/), order: z.number().int() });
export const timetableSlotInput = z.object({
  sectionId: z.string().uuid(), weekday: z.number().int().min(1).max(7), periodId: z.string().uuid(),
  subjectId: z.string().uuid(), teacherId: z.string().uuid().optional(), room: z.string().optional(),
});
export const calendarEventInput = z.object({
  kind: z.enum(['holiday', 'event', 'ptm', 'exam', 'vacation']),
  title: z.string().min(1), startsOn: isoDate, endsOn: isoDate,
  appliesTo: z.record(z.string(), z.unknown()).default({ all: true }), notes: z.string().optional(),
});
