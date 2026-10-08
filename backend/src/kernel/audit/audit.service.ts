import { Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { auditLog } from '../../db/schema';
import { Ctx } from '../context/request-context';
import { sha256 } from '../../common/crypto';

const REDACT = /password|otp|token|secret|code|pin|aadhaar|bank/i;
export function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, REDACT.test(k) ? '***' : redact(x, depth + 1)]));
}

/** Tamper-evident audit trail: each row's hash covers the previous row's hash (per tenant). */
@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async record(action: string, entity: string, entityId: string | null, diff: unknown = {}) {
    const ctx = Ctx.maybe();
    if (!ctx?.tenantId) return;
    await this.db.t(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'audit:' + ctx.tenantId}))`);
      const [prev] = await tx.select({ hash: auditLog.hash }).from(auditLog).where(eq(auditLog.tenantId, ctx.tenantId!)).orderBy(desc(auditLog.id)).limit(1);
      const at = new Date();
      const body = JSON.stringify({ action, entity, entityId, diff: redact(diff), actor: ctx.userId ?? null, at: at.toISOString() });
      const hash = sha256((prev?.hash ?? 'genesis') + body);
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId!, actorUserId: ctx.userId ?? null, action, entity, entityId, diff: redact(diff) as any,
        ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null, prevHash: prev?.hash ?? null, hash, at,
      });
    });
  }
}
