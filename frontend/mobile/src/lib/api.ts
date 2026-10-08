import { API } from './config';
import { session, refresh } from './session';

export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public details?: any) { super(message); } }

/** API call with bearer token, tenant header (common app), and one transparent refresh on 401. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const go = () => {
    const s = session.get();
    return fetch(`${API}/v1${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.auth !== false && s.accessToken ? { authorization: `Bearer ${s.accessToken}` } : {}), ...(s.tenantSlug ? { 'x-tenant': s.tenantSlug } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  };
  let r = await go();
  if (r.status === 401 && session.get().refreshToken && opts.auth !== false) {
    await refresh().catch(() => undefined);
    r = await go();
  }
  const text = await r.text();
  const j = text ? JSON.parse(text) : null;
  if (!r.ok) throw new ApiError(r.status, j?.error?.code ?? 'ERROR', j?.error?.message ?? 'Something went wrong', j?.error?.details);
  return j as T;
}
