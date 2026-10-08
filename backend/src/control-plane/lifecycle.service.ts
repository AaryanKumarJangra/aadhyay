import { Injectable, Logger } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { tenant, file } from '../db/schema';
import { nextTransition, reminderDue } from './lifecycle';
import { EventsService } from '../kernel/events/events.service';
import { TenantService } from '../kernel/tenancy/tenant.service';
import { StorageAdapter } from '../adapters/storage/storage.adapter';

@Injectable()
export class LifecycleService {
  private readonly log = new Logger('Lifecycle');
  constructor(private readonly db: DbService, private readonly events: EventsService, private readonly tenants: TenantService, private readonly storage: StorageAdapter) {}

  /** Daily job (worker cron 06:00 IST). Idempotent: reminders keyed by (tenant, kind, daysLeft, date). */
  async run(now = new Date()) {
    const rows = await this.db.admin.select().from(tenant).where(inArray(tenant.status, ['trial', 'active', 'grace', 'suspended', 'archived']));
    let changed = 0, reminded = 0;
    for (const t of rows) {
      const tr = nextTransition(t as any, now);
      if (tr) {
        await this.db.admin.update(tenant).set(tr.patch as any).where(eq(tenant.id, t.id));
        await this.tenants.invalidate(t);
        await this.events.emit('tenant.status_changed', { from: t.status, to: tr.to }, { tenantId: t.id });
        if (tr.to === 'purged') await this.purge(t.id);
        changed++;
      }
      const rem = reminderDue((tr ? { ...t, ...tr.patch } : t) as any, now);
      if (rem) {
        await this.events.emit('billing.renewal_due', { ...rem, status: tr?.to ?? t.status, tenantName: t.name }, { tenantId: t.id });
        reminded++;
      }
    }
    return { checked: rows.length, changed, reminded };
  }

  /** Permanent deletion after 12 months suspended (docs/01 §8). Keeps the tenant row as a tombstone for the certificate. */
  async purge(tenantId: string) {
    const files = await this.db.admin.select({ key: file.key }).from(file).where(eq(file.tenantId, tenantId));
    for (const f of files) await this.storage.delete(f.key).catch(() => undefined);
    const tables = await this.db.admin.execute(sql`select table_name from information_schema.columns where table_schema='public' and column_name='tenant_id' and table_name <> 'tenants'`);
    for (const r of tables.rows as any[]) {
      await this.db.admin.execute(sql.raw(`delete from "${r.table_name}" where tenant_id = '${tenantId.replace(/[^0-9a-f-]/g, '')}'`));
    }
    await this.db.admin.update(tenant).set({ status: 'purged', branding: {}, settings: { purgedAt: new Date().toISOString() } }).where(eq(tenant.id, tenantId));
    this.log.log(`tenant ${tenantId} purged`);
  }
}
