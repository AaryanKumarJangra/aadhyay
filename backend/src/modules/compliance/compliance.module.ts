import { Body, Controller, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { gzipSync } from 'node:zlib';
import { DbService } from '../../db/db.service';
import { dpdpRequest, consentRecord } from '../../db/schema';
import { Can, AllowSuspended, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { StorageAdapter } from '../../adapters/storage/storage.adapter';
import { crudController } from '../../common/crud';
import { DAY } from '../../common/dates';

const SECRET_COLS = new Set(['password_hash', 'totp_secret', 'token_enc', 'api_key_hash', 'refresh_hash', 'ciphertext']);

/** DPDP rights console + one-click full data export (works while suspended — docs/03 §7, docs/02 §12). */
@Injectable()
export class ComplianceService {
  constructor(private readonly db: DbService, private readonly storage: StorageAdapter) {}

  async request(b: { kind: string; details: string; userId?: string }) {
    const [r] = await this.db.t((tx) => tx.insert(dpdpRequest).values({ tenantId: Ctx.tenantId(), userId: b.userId ?? Ctx.userId(), kind: b.kind, details: b.details, dueAt: new Date(Date.now() + 30 * DAY) }).returning());
    return r;
  }

  /** Export every tenant table as JSON (gzip) to object storage; returns a 24h signed URL. */
  async exportAll() {
    const tid = Ctx.tenantId();
    const tables = await this.db.admin.execute(sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id' and is_nullable = 'NO' order by table_name`);
    const out: Record<string, unknown[]> = {};
    for (const t of tables.rows as any[]) {
      const rows = await this.db.t((tx) => tx.execute(sql.raw(`select * from "${t.table_name}"`)));
      out[t.table_name] = (rows.rows as any[]).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLS.has(k))));
    }
    const body = gzipSync(Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), tenantId: tid, format: 'aadhyay-export-v1', tables: out })));
    const key = `${tid}/exports/export-${Date.now()}.json.gz`;
    await this.storage.put(key, body, 'application/gzip');
    return { url: await this.storage.downloadUrl(key, 86400, 'aadhyay-export.json.gz'), sizeBytes: body.length, tables: Object.keys(out).length };
  }
}

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}
  /** Any user (parent, staff) can raise an access/correction/erasure/grievance request. */
  @Post('dpdp-requests') request(@Body(Z(z.object({ kind: z.enum(['access', 'correct', 'erase', 'grievance', 'withdraw_consent']), details: z.string().min(5) }))) b: any) { return this.svc.request(b); }
  @AllowSuspended() @Can('compliance.export.export') @Post('export') export() { return this.svc.exportAll(); }
}

export const DpdpCrud = crudController({ path: 'compliance/dpdp', module: 'compliance', perm: 'compliance.dpdp', table: dpdpRequest as any, create: z.object({ kind: z.string(), details: z.string() }), update: z.object({ status: z.enum(['open', 'in_progress', 'closed']), closedAt: z.coerce.date().optional() }), filters: { status: dpdpRequest.status } });
export const ConsentCrud = crudController({ path: 'compliance/consents', module: 'compliance', perm: 'compliance.consent', table: consentRecord as any, create: z.object({ subjectId: z.string().uuid().optional(), userId: z.string().uuid().optional(), purpose: z.enum(['photos_public', 'marketing', 'biometric', 'ai_features', 'location']), granted: z.boolean(), evidence: z.record(z.string(), z.unknown()).default({}) }), filters: { subjectId: consentRecord.subjectId, purpose: consentRecord.purpose } });

@Module({ controllers: [ComplianceController, DpdpCrud, ConsentCrud], providers: [ComplianceService] })
export class ComplianceModule {}
