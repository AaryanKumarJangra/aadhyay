import { z } from 'zod';
import { isoDate, paise } from './common';

export const feeHeadInput = z.object({ name: z.string().min(1), code: z.string().optional(), isTransport: z.boolean().default(false) });
export const feeStructureInput = z.object({
  sessionId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  category: z.string().optional(),
  name: z.string().min(1),
  lateFeeRule: z.object({ perDayPaise: paise.default(0), maxPaise: paise.default(0), graceDays: z.number().int().default(0) }).default({ perDayPaise: 0, maxPaise: 0, graceDays: 0 }),
  items: z.array(z.object({ headId: z.string().uuid(), amountPaise: paise, installmentNo: z.number().int().default(1), dueOn: isoDate })).min(1),
});
export const assignStructure = z.object({
  structureId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).optional(), // default: all students of the structure's class & category
});
export const discountApply = z.object({
  studentFeeIds: z.array(z.string().uuid()).min(1),
  percent: z.number().min(0).max(100).optional(),
  amountPaise: paise.optional(),
  reason: z.string().min(2),
});
export const collectFee = z.object({
  studentId: z.string().uuid(),
  mode: z.enum(['cash', 'upi', 'card', 'netbanking', 'cheque', 'dd', 'bank_transfer']),
  reference: z.string().optional(),
  /** Allocate to specific fees; if omitted, allocate oldest-due first. */
  allocations: z.array(z.object({ studentFeeId: z.string().uuid(), amountPaise: paise })).optional(),
  amountPaise: paise,
  collectedAt: z.string().datetime().optional(),
  waiveLateFee: z.boolean().default(false),
});
export const onlinePayInit = z.object({ studentId: z.string().uuid(), studentFeeIds: z.array(z.string().uuid()).min(1) });
export const cancelReceipt = z.object({ reason: z.string().min(3) });
