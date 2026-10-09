import 'server-only';
import { cookies } from 'next/headers';
import { forbidden } from 'next/navigation';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

/** Server-side call to the API (RSC / route handlers). Uses the session cookie when present. */
/**
 * A 403 renders the "no access" page (app/forbidden.tsx) unless the caller opts out with `onForbidden: 'throw'`
 * (e.g. optional widgets that `.catch()` and show nothing).
 */
export async function api<T = any>(path: string, init: RequestInit & { tenant?: string; auth?: boolean; revalidate?: number; tags?: string[]; onForbidden?: 'page' | 'throw' } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.tenant) headers.set('x-tenant', init.tenant);
  if (init.auth !== false) {
    const t = (await cookies()).get('aad_at')?.value;
    if (t) headers.set('authorization', `Bearer ${t}`);
  }
  const res = await fetch(`${API_URL}/v1${path}`, { ...init, headers, next: init.revalidate !== undefined || init.tags ? { revalidate: init.revalidate, tags: init.tags } : undefined, cache: init.revalidate === undefined && !init.tags ? 'no-store' : undefined });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (res.status === 403 && ['FORBIDDEN', 'MODULE_DISABLED'].includes(body?.error?.code) && init.onForbidden !== 'throw') {
    forbidden();
  }
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? res.statusText, body?.error?.details);
  return body as T;
}
