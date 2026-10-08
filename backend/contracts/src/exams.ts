import { z } from 'zod';
import { isoDate } from './common';

export const gradeScaleInput = z.object({
  name: z.string(),
  bands: z.array(z.object({ grade: z.string(), min: z.number(), max: z.number(), point: z.number().optional(), remark: z.string().optional() })).min(1),
});
export const examGroupInput = z.object({ name: z.string(), sessionId: z.string().uuid().optional(), kind: z.enum(['general', 'cbse', 'gpa']).default('general') });
export const examInput = z.object({ groupId: z.string().uuid(), name: z.string(), term: z.string().optional(), weightage: z.number().default(100), gradeScaleId: z.string().uuid().optional() });
export const scheduleInput = z.object({
  examId: z.string().uuid(), classId: z.string().uuid(), subjectId: z.string().uuid(), date: isoDate.optional(),
  startTime: z.string().optional(), endTime: z.string().optional(), room: z.string().optional(),
  maxMarks: z.number().positive(), passMarks: z.number().nonnegative(),
});
export const marksInput = z.object({
  scheduleId: z.string().uuid(),
  entries: z.array(z.object({ studentId: z.string().uuid(), marks: z.number().nonnegative().nullable(), isAbsent: z.boolean().default(false), remarks: z.string().optional() })),
});
export const publishResults = z.object({ examId: z.string().uuid(), notify: z.boolean().default(true) });
