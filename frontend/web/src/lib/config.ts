/** Server-side config. API_URL = NestJS API. BASE_DOMAIN = tenant subdomain root. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001';
export const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'aadhyay.com';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${BASE_DOMAIN}`;

/** Headers a BFF route passes to the API so rate limits and audit see the real client, not the web server. */
export const clientHeaders = (req: Request): Record<string, string> => ({
  'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
  ...(req.headers.get('user-agent') ? { 'user-agent': req.headers.get('user-agent')! } : {}),
});
