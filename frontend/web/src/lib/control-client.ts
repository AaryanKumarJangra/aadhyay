'use client';
import { ClientError } from './client';

/** Browser → control-plane BFF. Throws ClientError with the API's message (e.g. lifecycle rule violations). */
export async function ccall<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/control${path}`, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: opts.body ? { 'content-type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (res.status === 401) window.location.href = '/control/login';
  if (!res.ok) throw new ClientError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Request failed', body?.error?.details);
  return body as T;
}
