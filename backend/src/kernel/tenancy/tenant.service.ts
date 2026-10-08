import { Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { CORE_MODULES, type ModuleKey } from '@aadhyay/contracts';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';
import { tenant, tenantDomain, tenantModule } from '../../db/schema';
import { env } from '../../config/env';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  status: string;
  segment: string;
  timezone: string;
  planCode: string;
  stateCode: string | null;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantService {
  constructor(private readonly db: DbService, private readonly redis: RedisService) {}

  private toInfo(t: typeof tenant.$inferSelect): TenantInfo {
    return { id: t.id, slug: t.slug, name: t.name, status: t.status, segment: t.segment, timezone: t.timezone, planCode: t.planCode, stateCode: t.stateCode };
  }

  async byIdOrSlug(key: string): Promise<TenantInfo | null> {
    const ck = `tenant:${key}`;
    const cached = await this.redis.getJson<TenantInfo>(ck);
    if (cached) return cached;
    const [t] = await this.db.admin.select().from(tenant).where(UUID_RE.test(key) ? eq(tenant.id, key) : eq(tenant.slug, key)).limit(1);
    if (!t) return null;
    const info = this.toInfo(t);
    await this.redis.setJson(ck, info, 60);
    return info;
  }

  /** Host → tenant: <slug>.APP_BASE_DOMAIN or a verified custom domain. */
  async byHost(host: string): Promise<TenantInfo | null> {
    const h = host.toLowerCase().split(':')[0]!;
    const base = env.APP_BASE_DOMAIN;
    if (h.endsWith('.' + base)) {
      const sub = h.slice(0, -(base.length + 1));
      if (['www', 'app', 'api', 'control', 'rt', 'cdn'].includes(sub)) return null;
      if (!sub.includes('.')) return this.byIdOrSlug(sub);
    }
    const ck = `host:${h}`;
    const cached = await this.redis.client.get(ck);
    if (cached === '-') return null;
    if (cached) return this.byIdOrSlug(cached);
    const [d] = await this.db.admin.select().from(tenantDomain).where(and(eq(tenantDomain.host, h))).limit(1);
    const ok = d && (d.kind === 'subdomain' || d.verifiedAt);
    await this.redis.client.set(ck, ok ? d!.tenantId : '-', 'EX', 120);
    return ok ? this.byIdOrSlug(d!.tenantId) : null;
  }

  async enabledModules(tenantId: string): Promise<Set<string>> {
    const ck = `mods:${tenantId}`;
    const cached = await this.redis.getJson<string[]>(ck);
    if (cached) return new Set(cached);
    const rows = await this.db.admin.select({ k: tenantModule.moduleKey }).from(tenantModule).where(and(eq(tenantModule.tenantId, tenantId), eq(tenantModule.enabled, true)));
    const set = new Set<string>([...CORE_MODULES, ...rows.map((r) => r.k)]);
    await this.redis.setJson(ck, [...set], 60);
    return set;
  }
  async isModuleEnabled(tenantId: string, key: ModuleKey) {
    return (await this.enabledModules(tenantId)).has(key);
  }
  async invalidate(t: { id: string; slug: string }) {
    await this.redis.client.del(`tenant:${t.id}`, `tenant:${t.slug}`, `mods:${t.id}`);
  }
}
