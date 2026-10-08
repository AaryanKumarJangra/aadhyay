import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';
import { securityEvent } from '../../db/schema';
import { AppError } from '../../common/errors';

/** Failed attempts allowed before an identifier is locked. */
export const LOGIN_MAX_FAILURES = 5;
const FAIL_WINDOW_SEC = 15 * 60;
const BASE_LOCK_SEC = 15 * 60;
const MAX_LOCK_SEC = 24 * 3600;
const IP_LIMIT = 30; // attempts per IP per window, across all identifiers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LoginAttempt { scope: 'platform' | 'tenant'; subject: string; ip?: string; userAgent?: string; tenantId?: string | null }

/**
 * Password-login brute-force protection:
 *  - progressive delay on every failure (200 ms × failures, max 2 s)
 *  - after LOGIN_MAX_FAILURES failures in 15 min the identifier is locked; each further lockout doubles (max 24 h)
 *  - while locked even the correct password is refused
 *  - per-IP cap across identifiers (credential stuffing)
 *  - every failure, lockout and success is written to security_events
 */
@Injectable()
export class LoginGuard {
  private readonly log = new Logger('LoginGuard');
  constructor(private readonly redis: RedisService, private readonly db: DbService) {}

  private keys(a: LoginAttempt) {
    const s = `${a.scope}:${a.subject.toLowerCase()}`;
    return { fails: `login:fails:${s}`, lock: `login:lock:${s}`, lockouts: `login:lockouts:${s}`, ip: `login:ip:${a.scope}:${a.ip ?? 'unknown'}` };
  }

  /** Call before verifying credentials. Throws RATE_LIMITED while locked or when the IP is over its cap. */
  async before(a: LoginAttempt) {
    const k = this.keys(a);
    const ttl = await this.redis.client.ttl(k.lock);
    if (ttl > 0) {
      await this.record(a, `${a.scope}.login.blocked`, { retryAfterSec: ttl });
      throw new AppError('RATE_LIMITED', `Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minute(s).`, { retryAfterSec: ttl });
    }
    if (a.ip && !(await this.redis.rateLimit(k.ip, IP_LIMIT, FAIL_WINDOW_SEC))) {
      await this.record(a, `${a.scope}.login.ip_limited`, {});
      throw new AppError('RATE_LIMITED', 'Too many login attempts from this network. Try again later.');
    }
  }

  /** Call after a wrong password / TOTP. Applies the delay and, past the threshold, the lock. */
  async failed(a: LoginAttempt, reason: string) {
    const k = this.keys(a);
    const n = await this.redis.client.incr(k.fails);
    if (n === 1) await this.redis.client.expire(k.fails, FAIL_WINDOW_SEC);
    await this.record(a, `${a.scope}.login.failed`, { reason, failures: n });
    if (n >= LOGIN_MAX_FAILURES) {
      const lockouts = await this.redis.client.incr(k.lockouts);
      await this.redis.client.expire(k.lockouts, MAX_LOCK_SEC);
      const lockSec = Math.min(MAX_LOCK_SEC, BASE_LOCK_SEC * 2 ** (lockouts - 1));
      await this.redis.client.set(k.lock, '1', 'EX', lockSec);
      await this.redis.client.del(k.fails);
      await this.record(a, `${a.scope}.login.locked`, { lockSec, lockouts });
      this.log.warn(`${a.scope} login locked for ${lockSec}s after ${n} failures`);
    }
    await sleep(Math.min(2000, 200 * n));
  }

  async succeeded(a: LoginAttempt, actorId: string) {
    const k = this.keys(a);
    await this.redis.client.del(k.fails, k.lockouts);
    await this.record(a, `${a.scope}.login.success`, {}, actorId);
  }

  private async record(a: LoginAttempt, kind: string, meta: Record<string, unknown>, actorId?: string) {
    try {
      await this.db.admin.insert(securityEvent).values({ kind, subject: a.subject.toLowerCase(), tenantId: a.tenantId ?? null, actorId: actorId ?? null, ip: a.ip ?? null, userAgent: a.userAgent?.slice(0, 300) ?? null, meta });
    } catch (e: any) {
      // Never let audit storage failure open or close the login path; it is logged instead.
      this.log.error(`security event not stored: ${e?.message}`);
    }
  }
}
