'use client';
/** Browser → Next BFF (/api/v1/*) which adds the httpOnly session cookie and refreshes tokens. */
export class ClientError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}
export async function call<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth')) window.location.href = `/app/login?next=${encodeURIComponent(window.location.pathname)}`;
  if (!res.ok) throw new ClientError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Request failed', body?.error?.details);
  return body as T;
}
