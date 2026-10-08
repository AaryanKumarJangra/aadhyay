import { z } from 'zod';

export const quoteInput = z.object({
  planCode: z.string(),
  students: z.number().int().positive(),
  cycle: z.enum(['quarterly', 'yearly']).default('yearly'),
  addons: z.array(z.object({ code: z.string(), quantity: z.number().positive() })).default([]),
  unitPricePaise: z.number().int().positive().optional(), // within price-book range
  includeSetup: z.boolean().default(true),
  placeOfSupply: z.string().regex(/^\d{2}$/).optional(),
});
export const walletTopup = z.object({ amountPaise: z.number().int().min(10000) });
export const expenseInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), category: z.enum(['infra', 'tools', 'salary', 'marketing', 'compliance', 'other']),
  vendor: z.string(), amountPaise: z.number().int().nonnegative(), gstPaise: z.number().int().nonnegative().default(0), recurring: z.boolean().default(false), note: z.string().optional(),
});
/** Tenant/control quotes: no defaults, so the server decides setup inclusion (first purchase only). */
export const tenantQuoteInput = z.object({
  planCode: z.string(), students: z.number().int().positive().optional(), cycle: z.enum(['quarterly', 'yearly']).optional(),
  addons: z.array(z.object({ code: z.string(), quantity: z.number().positive() })).optional(), unitPricePaise: z.number().int().positive().optional(),
  includeSetup: z.boolean().optional(),
});
