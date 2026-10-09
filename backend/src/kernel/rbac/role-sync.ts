import { and, eq } from 'drizzle-orm';
import { ROLE_TEMPLATES, TEMPLATE_VERSION, materialise } from '@aadhyay/contracts';
import type { DB } from '../../db/db.service';
import { role, tenant } from '../../db/schema';

/**
 * Brings every tenant's system roles up to the current templates: adds missing ones and upgrades those the institution
 * never edited (`is_customized = false`). Customised roles are left exactly as the institution configured them.
 * Runs with the admin connection (all tenants). Returns counts for logging.
 */
export async function syncSystemRoles(db: DB, tenantId?: string) {
  const tenants = tenantId ? [{ id: tenantId }] : await db.select({ id: tenant.id }).from(tenant);
  let added = 0, upgraded = 0;
  for (const t of tenants) {
    const existing = await db.select().from(role).where(eq(role.tenantId, t.id));
    for (const [key, tpl] of Object.entries(ROLE_TEMPLATES)) {
      const m = materialise(tpl);
      const cur = existing.find((r) => r.key === key);
      if (!cur) {
        await db.insert(role).values({ tenantId: t.id, key, name: tpl.name, description: tpl.description, ...m, isSystem: true, templateVersion: TEMPLATE_VERSION });
        added++;
      } else if (cur.isSystem && !cur.isCustomized && cur.templateVersion < TEMPLATE_VERSION) {
        await db.update(role).set({ name: tpl.name, description: tpl.description, ...m, templateVersion: TEMPLATE_VERSION }).where(and(eq(role.id, cur.id), eq(role.tenantId, t.id)));
        upgraded++;
      }
    }
  }
  return { tenants: tenants.length, added, upgraded };
}
