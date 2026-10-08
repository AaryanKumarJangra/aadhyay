import { z } from 'zod';
import { phoneIN } from './common';

export const otpRequest = z.object({ phone: phoneIN, purpose: z.enum(['login', 'signup']).default('login') });
export const otpVerify = z.object({
  phone: phoneIN,
  code: z.string().regex(/^\d{6}$/),
  deviceId: z.string().min(8).max(100),
  deviceName: z.string().max(100).optional(),
  platform: z.enum(['android', 'ios', 'web']).default('web'),
  name: z.string().min(1).max(120).optional(), // for first-time signup
  tenantSlug: z.string().optional(),
});
export const passwordLogin = z.object({
  login: z.string().min(3), // email or phone
  password: z.string().min(8),
  deviceId: z.string().min(8).max(100),
  platform: z.enum(['android', 'ios', 'web']).default('web'),
  totp: z.string().regex(/^\d{6}$/).optional(),
});
export const refreshBody = z.object({ refreshToken: z.string().min(20) });
export const switchTenant = z.object({ tenantId: z.string().uuid() });
export const setPassword = z.object({ password: z.string().min(8).max(128) });
export const totpEnable = z.object({ code: z.string().regex(/^\d{6}$/) });

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
