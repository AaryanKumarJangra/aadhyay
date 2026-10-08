import { z } from 'zod';
import { phoneIN } from './common';

export const leadInput = z.object({
  name: z.string().min(1), phone: phoneIN, email: z.string().email().optional(), forClass: z.string().optional(),
  source: z.string().default('walk_in'), stageId: z.string().uuid().optional(), ownerId: z.string().uuid().optional(),
  utm: z.record(z.string(), z.string()).default({}), note: z.string().optional(),
});
export const leadUpdate = leadInput.partial().extend({ score: z.number().int().optional(), lostReason: z.string().optional(), nextFollowUpAt: z.string().datetime().optional() });
export const leadActivityInput = z.object({ kind: z.enum(['note', 'call', 'whatsapp', 'email', 'visit', 'task']), body: z.string().optional(), dueAt: z.string().datetime().optional() });
export const convertLead = z.object({ sectionId: z.string().uuid().optional(), admissionNo: z.string().optional() });
