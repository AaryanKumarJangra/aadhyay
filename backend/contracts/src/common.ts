import { z } from 'zod';

export const uuid = z.string().uuid();
export const phoneIN = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (v.startsWith('+') ? v : v.length === 10 ? `+91${v}` : v.startsWith('91') && v.length === 12 ? `+${v}` : v))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid mobile number, e.g. 98765 43210'));
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const paise = z.number().int().nonnegative();
export const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().optional(),
});
export type ListQuery = z.infer<typeof listQuery>;
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const ERROR_CODES = [
  'VALIDATION_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'TENANT_SUSPENDED',
  'MODULE_DISABLED', 'RATE_LIMITED', 'WALLET_EMPTY', 'OTP_INVALID', 'OTP_EXPIRED', 'BAD_REQUEST', 'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/** ₹ formatting helpers (Indian grouping). */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const formatINR = (p: number) =>
  '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const GST_RATE = 0.18;
export const withGst = (p: number) => Math.round(p * (1 + GST_RATE));
