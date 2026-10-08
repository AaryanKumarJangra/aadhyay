import { z } from 'zod';

export const connectWaAccount = z.object({
  wabaId: z.string(), phoneNumberId: z.string(), displayPhone: z.string(), accessToken: z.string().min(20), verifiedName: z.string().optional(),
});
export const waTemplateInput = z.object({
  name: z.string().regex(/^[a-z0-9_]{1,512}$/),
  language: z.string().default('en'),
  category: z.enum(['marketing', 'utility', 'authentication']),
  components: z.array(z.record(z.string(), z.unknown())).min(1),
});
export const waFlowInput = z.object({
  name: z.string().min(1), categories: z.array(z.string()).default(['OTHER']),
  flowJson: z.record(z.string(), z.unknown()),
});
export const waSendInput = z.object({
  to: z.string(),
  template: z.object({ name: z.string(), language: z.string().default('en'), variables: z.array(z.string()).default([]) }).optional(),
  text: z.string().max(4096).optional(),
}).refine((v) => v.template || v.text, 'template or text required');
