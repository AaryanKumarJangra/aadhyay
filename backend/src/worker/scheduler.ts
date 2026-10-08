import { INestApplicationContext, Logger } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { RedisService } from '../kernel/redis/redis.service';
import { tenant } from '../db/schema';
import { Ctx } from '../kernel/context/request-context';
import { LifecycleService } from '../control-plane/lifecycle.service';
import { FeesService } from '../modules/fees/fees.service';
import { AttendanceService } from '../modules/attendance/attendance.service';
import { MessengerService } from '../modules/messenger/messenger.service';
import { todayIn } from '../common/dates';

const IST = 'Asia/Kolkata';
const hhmm = (tz: string, d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** Minute-tick scheduler. Each job runs once per window across all worker replicas (Redis NX lock). */
export function startScheduler(app: INestApplicationContext) {
  const log = new Logger('Scheduler');
  const db = app.get(DbService), redis = app.get(RedisService);
  const once = async (key: string, ttlSec: number) => (await redis.client.set(`job:${key}`, '1', 'EX', ttlSec, 'NX')) === 'OK';
  const activeTenants = () => db.admin.select().from(tenant).where(inArray(tenant.status, ['trial', 'active', 'grace']));

  const tick = async () => {
    const now = new Date();
    const t = hhmm(IST, now), day = todayIn(IST, now);
    try {
      if (t === '06:00' && (await once(`lifecycle:${day}`, 86400))) log.log(`lifecycle ${JSON.stringify(await app.get(LifecycleService).run(now))}`);
      if (t === '07:30' && (await once(`fee-reminders:${day}`, 86400))) {
        for (const tn of await activeTenants()) await Ctx.asTenant(tn.id, () => app.get(FeesService).reminders(todayIn(tn.timezone, now)), { tenantTz: tn.timezone }).catch((e) => log.warn(`fees ${tn.slug}: ${e.message}`));
      }
      // Device-attendance cut-off per tenant (settings.attendance.autoAbsentAt = "HH:mm")
      for (const tn of await activeTenants()) {
        const at = (tn.settings as any)?.attendance?.autoAbsentAt;
        if (at && hhmm(tn.timezone, now) === at && (await once(`auto-absent:${tn.id}:${day}`, 86400))) {
          await Ctx.asTenant(tn.id, () => app.get(AttendanceService).autoAbsent(todayIn(tn.timezone, now)), { tenantTz: tn.timezone }).catch((e) => log.warn(`absent ${tn.slug}: ${e.message}`));
        }
      }
      if (t.endsWith(':05') && (await once(`media-cleanup:${day}:${t}`, 3600))) await app.get(MessengerService).cleanupMedia();
    } catch (e: any) {
      log.error(e.message);
    }
  };
  const timer = setInterval(() => void tick(), 60_000);
  void tick();
  return () => clearInterval(timer);
}
