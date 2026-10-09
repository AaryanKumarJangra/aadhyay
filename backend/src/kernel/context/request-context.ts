import { AsyncLocalStorage } from 'node:async_hooks';
import type { Grant } from '@aadhyay/contracts';
import type { Tx } from '../../db/db.service';
export interface RequestCtx {
  requestId: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantStatus?: string;
  tenantTz?: string;
  userId?: string;
  sessionId?: string;
  membershipIds?: string[];
  kinds?: string[]; // staff | student | guardian | alumni
  personIds?: Record<string, string>; // kind -> person id
  permissions?: Set<string>; // granted patterns (legacy checks); decisions use `grants`
  grants?: Grant[];
  roles?: { key: string; name: string }[];
  modules?: string[]; // enabled modules of the tenant
  studentIds?: string[]; // "own" students: self and/or children
  platformUser?: { id: string; role: string };
  ip?: string;
  userAgent?: string;
  tx?: Tx; // active tenant transaction (nested calls reuse it)
}

const als = new AsyncLocalStorage<RequestCtx>();

export const Ctx = {
  run<T>(ctx: RequestCtx, fn: () => T): T {
    return als.run(ctx, fn);
  },
  get(): RequestCtx {
    const c = als.getStore();
    if (!c) throw new Error('No request context');
    return c;
  },
  maybe(): RequestCtx | undefined {
    return als.getStore();
  },
  tenantId(): string {
    const t = als.getStore()?.tenantId;
    if (!t) throw new Error('Tenant context required');
    return t;
  },
  userId(): string | undefined {
    return als.getStore()?.userId;
  },
  /** Run fn as a specific tenant (workers / system jobs). */
  asTenant<T>(tenantId: string, fn: () => T, extra: Partial<RequestCtx> = {}): T {
    const system = { pattern: '*', scope: 'tenant' as const, source: { roleKey: 'system', roleName: 'System' } };
    return als.run({ requestId: 'system', tenantId, permissions: new Set(['*']), grants: [system], ...extra }, fn);
  },
};
