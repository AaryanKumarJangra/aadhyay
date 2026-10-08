import { z } from 'zod';
import { loadEnv } from './load-env';

loadEnv();

const bool = z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean());
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_BASE_DOMAIN: z.string().default('aadhyay.com'),
  API_PORT: z.coerce.number().default(4000),
  REALTIME_PORT: z.coerce.number().default(4001),
  WEB_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string(),
  APP_DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Prefix for every Redis key and pub/sub channel, so dev, test and other stacks sharing one Redis never see each other's data. */
  REDIS_NAMESPACE: z.string().regex(/^[a-z0-9_-]+$/).default('aad'),
  /**
   * Which peers may set X-Forwarded-For. 'false' = use the socket address (no proxy), 'true' = trust everything
   * (tests only), otherwise a comma list for proxy-addr (e.g. 'loopback,uniquelocal' or '10.0.0.0/8').
   * Defaults: production → private networks only (Caddy/web on the docker network); other envs → 'loopback'.
   */
  TRUST_PROXY: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().startsWith('base64:'),
  PHONE_HASH_PEPPER: z.string().min(8),
  OTP_DEV_ECHO: bool.default(false),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('aadhyay'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'ses', 'log']).default('log'),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default('Aadhyay <no-reply@aadhyay.com>'),
  RESEND_API_KEY: z.string().optional(),
  SMS_PROVIDER: z.enum(['log', 'msg91', 'fast2sms']).default('log'),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().default('AADHYA'),
  PUSH_PROVIDER: z.enum(['log', 'fcm']).default('log'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  WHATSAPP_PROVIDER: z.enum(['log', 'meta']).default('log'),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v23.0'),
  PLATFORM_WA_PHONE_NUMBER_ID: z.string().optional(),
  PLATFORM_WA_TOKEN: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['log', 'razorpay']).default('log'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  TURN_URLS: z.string().default('turn:localhost:3478'),
  TURN_SECRET: z.string().default('dev-turn-secret'),
  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('secret'),
  COMPANY_GSTIN: z.string().optional(),
  COMPANY_STATE_CODE: z.string().default('09'),
  COMPANY_NAME: z.string().default('Aadhyay Technologies Pvt Ltd'),
});

/** Values that are only acceptable on a developer machine. */
const DEV_ONLY: Partial<Record<keyof z.infer<typeof schema>, string[]>> = {
  TURN_SECRET: ['dev-turn-secret'],
  LIVEKIT_API_KEY: ['devkey'],
  LIVEKIT_API_SECRET: ['secret'],
};
const checked = schema.superRefine((v, ctx) => {
  if (v.NODE_ENV !== 'production') return;
  for (const [k, bad] of Object.entries(DEV_ONLY)) {
    if (bad!.includes(String((v as any)[k]))) ctx.addIssue({ code: 'custom', path: [k], message: `${k} uses a development default; set a real secret in production` });
  }
  if (v.OTP_DEV_ECHO) ctx.addIssue({ code: 'custom', path: ['OTP_DEV_ECHO'], message: 'OTP_DEV_ECHO must be off in production' });
  if (/REPLACE|changeme|ci-secret/i.test(v.JWT_SECRET)) ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET looks like a placeholder' });
});

export type Env = z.infer<typeof schema>;
const parsed = checked.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
  throw new Error('Invalid environment');
}
export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
