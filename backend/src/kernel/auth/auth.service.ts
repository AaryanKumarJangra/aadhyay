import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';
import { LoginGuard } from './login-guard.service';
import { TokenService, ACCESS_TTL_SEC } from './token.service';
import { AccessService } from '../rbac/access.service';
import { user, session, membership, tenant, guardian, staff, student, waAccount } from '../../db/schema';
import { AppError } from '../../common/errors';
import { phoneHash, randomToken, sha256, decrypt } from '../../common/crypto';
import { env } from '../../config/env';
import { uuidv7 } from '../../common/ids';
import { WhatsAppAdapter } from '../../adapters/whatsapp/whatsapp.adapter';
import { SmsAdapter } from '../../adapters/sms/sms.adapter';
import { verifyTotp, newTotpSecret, totpUri } from './totp';
import { encrypt } from '../../common/crypto';
import { EventsService } from '../events/events.service';

const REFRESH_TTL_MS = 60 * 86400_000;
const OTP_TTL_SEC = 300;

export interface DeviceInfo { deviceId: string; deviceName?: string; platform?: string; ip?: string; userAgent?: string }

@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');
  constructor(
    private readonly db: DbService,
    private readonly loginGuard: LoginGuard,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly wa: WhatsAppAdapter,
    private readonly sms: SmsAdapter,
    private readonly events: EventsService,
  ) {}

  // ---------------- OTP ----------------
  async requestOtp(phone: string, ip?: string) {
    if (!(await this.redis.rateLimit(`otp:phone:${phone}`, 5, 3600))) throw new AppError('RATE_LIMITED', 'Too many OTP requests. Try again in an hour.');
    if (ip && !(await this.redis.rateLimit(`otp:ip:${ip}`, 30, 3600))) throw new AppError('RATE_LIMITED', 'Too many requests');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.setJson(`otp:${phone}`, { h: sha256(code + phone), n: 0 }, OTP_TTL_SEC);
    const channel = await this.deliverOtp(phone, code);
    return { sent: true, channel, expiresIn: OTP_TTL_SEC, ...(env.OTP_DEV_ECHO && env.NODE_ENV !== 'production' ? { devCode: code } : {}) };
  }

  /** Platform OTP: WhatsApp authentication template on Aadhyay's own number → SMS fallback (docs/01 §7.2). */
  private async deliverOtp(phone: string, code: string): Promise<'whatsapp' | 'sms'> {
    try {
      const [acc] = await this.db.admin.select().from(waAccount).where(isNull(waAccount.tenantId)).limit(1);
      const creds = acc ? { phoneNumberId: acc.phoneNumberId, token: decrypt(acc.tokenEnc) } : env.PLATFORM_WA_PHONE_NUMBER_ID ? { phoneNumberId: env.PLATFORM_WA_PHONE_NUMBER_ID, token: env.PLATFORM_WA_TOKEN! } : null;
      if (creds) {
        await this.wa.sendTemplate(creds, phone, { name: 'aadhyay_login_otp', language: 'en', bodyParams: [code], buttonUrlParam: code });
        return 'whatsapp';
      }
    } catch (e: any) {
      this.log.warn(`WA OTP failed, falling back to SMS: ${e.message}`);
    }
    await this.sms.send(phone, `${code} is your Aadhyay login code. Valid for 5 minutes. Do not share it.`);
    return 'sms';
  }

  private async checkOtp(phone: string, code: string) {
    const st = await this.redis.getJson<{ h: string; n: number }>(`otp:${phone}`);
    if (!st) throw new AppError('OTP_EXPIRED', 'OTP expired. Please request a new one.');
    if (st.n >= 5) throw new AppError('OTP_INVALID', 'Too many wrong attempts. Request a new OTP.');
    if (st.h !== sha256(code + phone)) {
      await this.redis.setJson(`otp:${phone}`, { ...st, n: st.n + 1 }, OTP_TTL_SEC);
      throw new AppError('OTP_INVALID', 'Incorrect OTP');
    }
    await this.redis.client.del(`otp:${phone}`);
  }

  async verifyOtp(input: { phone: string; code: string; name?: string; tenantSlug?: string } & DeviceInfo) {
    await this.checkOtp(input.phone, input.code);
    const u = await this.ensureUser(input.phone, input.name);
    await this.claimMemberships(u.id, input.phone);
    return this.issue(u.id, input, input.tenantSlug);
  }

  async passwordLogin(input: { login: string; password: string; totp?: string } & DeviceInfo) {
    const login = input.login.trim().toLowerCase();
    const attempt = { scope: 'tenant' as const, subject: login, ip: input.ip, userAgent: input.userAgent };
    await this.loginGuard.before(attempt);
    const [u] = await this.db.admin.select().from(user).where(login.includes('@') ? eq(user.email, login) : eq(user.phone, login.startsWith('+') ? login : `+91${login.slice(-10)}`)).limit(1);
    const ok = u?.passwordHash ? await argon2.verify(u.passwordHash, input.password).catch(() => false) : false;
    if (!ok) {
      await this.loginGuard.failed(attempt, u ? 'bad_password' : 'unknown_account');
      throw new AppError('UNAUTHENTICATED', 'Invalid login or password');
    }
    if (u!.isDisabled) throw new AppError('FORBIDDEN', 'Account disabled');
    if (u!.totpEnabled) {
      if (!input.totp) throw new AppError('UNAUTHENTICATED', 'Two-factor code required', { totpRequired: true });
      if (!verifyTotp(decrypt(u!.totpSecret!), input.totp)) {
        await this.loginGuard.failed(attempt, 'bad_totp');
        throw new AppError('UNAUTHENTICATED', 'Invalid two-factor code');
      }
    }
    await this.loginGuard.succeeded(attempt, u!.id);
    return this.issue(u!.id, input);
  }

  /** Global user by phone (created on first contact: login, admission, staff creation, messenger signup). */
  async ensureUser(phone: string, name?: string) {
    const [existing] = await this.db.admin.select().from(user).where(eq(user.phone, phone)).limit(1);
    if (existing) {
      if (name && existing.name === 'Aadhyay user') await this.db.admin.update(user).set({ name }).where(eq(user.id, existing.id));
      return existing;
    }
    const [created] = await this.db.admin
      .insert(user)
      .values({ phone, phoneHash: phoneHash(phone), name: name ?? 'Aadhyay user' })
      .onConflictDoNothing()
      .returning();
    if (created) {
      await this.events.emit('user.registered', { userId: created.id, phoneHash: created.phoneHash }, { tenantId: null });
      return created;
    }
    const [again] = await this.db.admin.select().from(user).where(eq(user.phone, phone)).limit(1);
    return again!;
  }

  /** Safety net: link any guardian/staff/student records with this phone that have no login yet. */
  async claimMemberships(userId: string, phone: string) {
    const gs = await this.db.admin.select({ id: guardian.id, tenantId: guardian.tenantId }).from(guardian).where(and(eq(guardian.phone, phone), isNull(guardian.userId)));
    for (const g of gs) {
      await this.db.admin.update(guardian).set({ userId }).where(eq(guardian.id, g.id));
      await this.db.admin.insert(membership).values({ tenantId: g.tenantId, userId, kind: 'guardian', personId: g.id }).onConflictDoNothing();
      await this.access.bust(g.tenantId);
    }
    const ss = await this.db.admin.select({ id: staff.id, tenantId: staff.tenantId }).from(staff).where(and(eq(staff.phone, phone), isNull(staff.userId)));
    for (const s of ss) {
      await this.db.admin.update(staff).set({ userId }).where(eq(staff.id, s.id));
      await this.db.admin.insert(membership).values({ tenantId: s.tenantId, userId, kind: 'staff', personId: s.id }).onConflictDoNothing();
      await this.access.bust(s.tenantId);
    }
    const st = await this.db.admin.select({ id: student.id, tenantId: student.tenantId }).from(student).where(and(eq(student.phone, phone), isNull(student.userId)));
    for (const s of st) {
      await this.db.admin.update(student).set({ userId }).where(eq(student.id, s.id));
      await this.db.admin.insert(membership).values({ tenantId: s.tenantId, userId, kind: 'student', personId: s.id }).onConflictDoNothing();
      await this.access.bust(s.tenantId);
    }
  }

  // ---------------- Sessions ----------------
  async issue(userId: string, dev: DeviceInfo, preferTenant?: string) {
    const mems = await this.memberships(userId);
    let tid: string | undefined;
    if (preferTenant) tid = mems.find((m) => m.tenantSlug === preferTenant || m.tenantId === preferTenant)?.tenantId;
    if (!tid && new Set(mems.map((m) => m.tenantId)).size === 1) tid = mems[0]!.tenantId;
    const refresh = randomToken(32);
    const sid = uuidv7();
    await this.db.admin.insert(session).values({
      id: sid, userId, deviceId: dev.deviceId, deviceName: dev.deviceName, platform: dev.platform, refreshHash: sha256(refresh),
      familyId: sid, tenantId: tid, ip: dev.ip, userAgent: dev.userAgent, expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    await this.db.admin.update(user).set({ lastActiveAt: new Date() }).where(eq(user.id, userId));
    const accessToken = await this.tokens.sign({ sub: userId, sid, tid, typ: 'access' });
    const [u] = await this.db.admin.select({ id: user.id, name: user.name, phone: user.phone, email: user.email, locale: user.locale }).from(user).where(eq(user.id, userId));
    return { accessToken, refreshToken: refresh, expiresIn: ACCESS_TTL_SEC, user: u, memberships: mems, tenantId: tid ?? null };
  }

  async refresh(refreshToken: string) {
    const [s] = await this.db.admin.select().from(session).where(eq(session.refreshHash, sha256(refreshToken))).limit(1);
    if (!s) throw new AppError('UNAUTHENTICATED', 'Invalid session');
    if (s.revokedAt) {
      // Reuse of a rotated token → assume theft, revoke the whole family.
      await this.db.admin.update(session).set({ revokedAt: new Date() }).where(eq(session.familyId, s.familyId));
      throw new AppError('UNAUTHENTICATED', 'Session revoked');
    }
    if (s.expiresAt < new Date()) throw new AppError('UNAUTHENTICATED', 'Session expired');
    const next = randomToken(32);
    const nid = uuidv7();
    await this.db.admin.transaction(async (tx) => {
      await tx.update(session).set({ revokedAt: new Date() }).where(eq(session.id, s.id));
      await tx.insert(session).values({ ...s, id: nid, refreshHash: sha256(next), revokedAt: null, createdAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) });
    });
    const accessToken = await this.tokens.sign({ sub: s.userId, sid: nid, tid: s.tenantId ?? undefined, typ: 'access' });
    return { accessToken, refreshToken: next, expiresIn: ACCESS_TTL_SEC };
  }

  async logout(sessionId: string) {
    const [s] = await this.db.admin.select().from(session).where(eq(session.id, sessionId)).limit(1);
    if (!s) return { ok: true };
    await this.db.admin.update(session).set({ revokedAt: new Date() }).where(eq(session.familyId, s.familyId));
    await this.redis.client.set(`revoked:${sessionId}`, '1', 'EX', ACCESS_TTL_SEC);
    return { ok: true };
  }

  async switchTenant(userId: string, sessionId: string, tenantId: string) {
    const mems = await this.memberships(userId);
    if (!mems.some((m) => m.tenantId === tenantId)) throw new AppError('FORBIDDEN', 'Not a member of that institution');
    await this.db.admin.update(session).set({ tenantId }).where(eq(session.id, sessionId));
    const accessToken = await this.tokens.sign({ sub: userId, sid: sessionId, tid: tenantId, typ: 'access' });
    return { accessToken, expiresIn: ACCESS_TTL_SEC, tenantId };
  }

  async memberships(userId: string) {
    const rows = await this.db.admin
      .select({ id: membership.id, tenantId: membership.tenantId, kind: membership.kind, personId: membership.personId, tenantSlug: tenant.slug, tenantName: tenant.name, branding: tenant.branding, segment: tenant.segment, status: tenant.status })
      .from(membership)
      .innerJoin(tenant, eq(tenant.id, membership.tenantId))
      .where(and(eq(membership.userId, userId), eq(membership.status, 'active')));
    return rows;
  }

  async sessions(userId: string) {
    return this.db.admin.select({ id: session.id, deviceName: session.deviceName, platform: session.platform, lastUsedAt: session.lastUsedAt, createdAt: session.createdAt, ip: session.ip })
      .from(session).where(and(eq(session.userId, userId), isNull(session.revokedAt)));
  }

  async setPassword(userId: string, password: string) {
    await this.db.admin.update(user).set({ passwordHash: await argon2.hash(password, { type: argon2.argon2id }) }).where(eq(user.id, userId));
    return { ok: true };
  }
  async totpSetup(userId: string) {
    const secret = newTotpSecret();
    const [u] = await this.db.admin.update(user).set({ totpSecret: encrypt(secret), totpEnabled: false }).where(eq(user.id, userId)).returning();
    return { secret, uri: totpUri(secret, u!.phone ?? u!.email ?? u!.id) };
  }
  async totpEnable(userId: string, code: string) {
    const [u] = await this.db.admin.select().from(user).where(eq(user.id, userId));
    if (!u?.totpSecret || !verifyTotp(decrypt(u.totpSecret), code)) throw new AppError('BAD_REQUEST', 'Invalid code');
    await this.db.admin.update(user).set({ totpEnabled: true }).where(eq(user.id, userId));
    return { ok: true };
  }
}
