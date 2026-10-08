import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@aadhyay/contracts';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 422, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
  TENANT_SUSPENDED: 402, MODULE_DISABLED: 403, RATE_LIMITED: 429, WALLET_EMPTY: 402, OTP_INVALID: 400,
  OTP_EXPIRED: 400, BAD_REQUEST: 400, INTERNAL: 500,
};

/** The only error type services should throw. Rendered as { error: { code, message, details } }. */
export class AppError extends HttpException {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super({ error: { code, message, details } }, STATUS[code]);
  }
}
export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have permission for this action') => new AppError('FORBIDDEN', msg);
export const conflict = (msg: string) => new AppError('CONFLICT', msg);
export const badRequest = (msg: string, details?: unknown) => new AppError('BAD_REQUEST', msg, details);
