import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/bootstrap';
import { DbService } from '../src/db/db.service';
import { EventsService } from '../src/kernel/events/events.service';
import { seedBase } from '../src/scripts/seed-data';

export interface Api {
  app: NestFastifyApplication;
  req: (method: string, url: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string> }) => Promise<{ status: number; body: any }>;
  login: (phone: string, name?: string, tenantSlug?: string) => Promise<{ token: string; userId: string; refreshToken: string; body: any }>;
  drain: () => Promise<void>;
  db: DbService;
  close: () => Promise<void>;
}

let counter = 0;
export const uniquePhone = () => `+9198${String(Date.now()).slice(-6)}${String(++counter).padStart(2, '0')}`;

export async function setup(): Promise<Api> {
  const app = await createApp({ logger: process.env.E2E_LOGS === '1' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const db = app.get(DbService);
  await seedBase(db.admin, { email: 'e2e-admin@aadhyay.com', password: 'E2e@password1' });
  const events = app.get(EventsService);
  const req: Api['req'] = async (method, url, opts = {}) => {
    const res = await app.inject({
      method: method as any, url: `/v1${url}`,
      headers: { ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }), 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.headers ?? {}) },
      payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let body: any = res.body;
    try { body = JSON.parse(res.body); } catch {}
    return { status: res.statusCode, body };
  };
  const login: Api['login'] = async (phone, name, tenantSlug) => {
    const r1 = await req('POST', '/auth/otp/request', { body: { phone } });
    if (r1.status !== 201) throw new Error(`otp request failed ${JSON.stringify(r1.body)}`);
    const r2 = await req('POST', '/auth/otp/verify', { body: { phone, code: r1.body.devCode, deviceId: `test-device-${phone}`, name, tenantSlug } });
    if (r2.status !== 201) throw new Error(`otp verify failed ${JSON.stringify(r2.body)}`);
    return { token: r2.body.accessToken, userId: r2.body.user.id, refreshToken: r2.body.refreshToken, body: r2.body };
  };
  return { app, req, login, db, drain: () => events.drainAll(), close: () => app.close() };
}

/** Create a trial school and log in as its owner. */
export async function newSchool(api: Api, name = `Test School ${Date.now()}${++counter}`) {
  const ownerPhone = uniquePhone();
  const s = await api.req('POST', '/public/signup', { body: { institutionName: name, segment: 'school', city: 'Meerut', state: 'Uttar Pradesh', stateCode: '09', ownerName: 'Owner', ownerPhone } });
  if (s.status !== 201) throw new Error(`signup failed ${JSON.stringify(s.body)}`);
  const owner = await api.login(ownerPhone, 'Owner', s.body.slug);
  // Tests run at any hour: disable quiet hours for deterministic delivery.
  await api.req('PATCH', '/org/settings', { token: owner.token, body: { quietHours: { start: '00:00', end: '00:00' } } });
  return { slug: s.body.slug as string, tenantId: s.body.tenantId as string, owner, ownerPhone };
}
