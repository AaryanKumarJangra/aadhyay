import { Controller, Get, HttpException, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { RedisService } from './redis/redis.service';
import { Public } from './auth/decorators';
import { TenantService } from './tenancy/tenant.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService, private readonly redis: RedisService, private readonly tenants: TenantService) {}
  @Public() @Get()
  async health() {
    const t0 = Date.now();
    await this.db.admin.execute(sql`select 1`);
    await this.redis.client.ping();
    return { ok: true, dbMs: Date.now() - t0, version: process.env.APP_VERSION ?? 'dev' };
  }

  /** Caddy on-demand TLS "ask" hook: 200 only for hosts that map to an active tenant (verified custom domain). */
  @Public() @Get('tls-ask')
  async tlsAsk(@Query('domain') domain?: string) {
    const t = domain ? await this.tenants.byHost(domain) : null;
    if (!t) throw new HttpException('unknown host', 404);
    return { ok: true };
  }
}
