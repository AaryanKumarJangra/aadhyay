import { z } from 'zod';
import { isoDate } from './common';

export const ATTENDANCE_STATUS = ['present', 'absent', 'late', 'half_day', 'leave', 'holiday'] as const;
export const markSectionAttendance = z.object({
  sectionId: z.string().uuid(),
  date: isoDate,
  periodId: z.string().uuid().optional(),
  /** Only exceptions needed: everyone not listed is marked `defaultStatus`. */
  defaultStatus: z.enum(ATTENDANCE_STATUS).default('present'),
  entries: z.array(z.object({ studentId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUS), remarks: z.string().optional() })).default([]),
  sourceTs: z.string().datetime().optional(),
});
export const markStaffAttendance = z.object({
  date: isoDate,
  entries: z.array(z.object({ staffId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUS), inAt: z.string().datetime().optional(), outAt: z.string().datetime().optional() })),
});
/** Device push (QR/RFID/face/biometric/gate app). Authenticated by device API key. */
export const devicePunch = z.object({
  punches: z.array(z.object({
    code: z.string().min(1), // QR payload, RFID uid, or face/biometric subject id
    at: z.string().datetime(),
    direction: z.enum(['in', 'out']).default('in'),
  })).min(1).max(500),
});
export const leaveRequestInput = z.object({
  studentId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  fromDate: isoDate, toDate: isoDate, reason: z.string().min(3), leaveTypeId: z.string().uuid().optional(),
});
export const leaveDecision = z.object({ status: z.enum(['approved', 'rejected']) });
