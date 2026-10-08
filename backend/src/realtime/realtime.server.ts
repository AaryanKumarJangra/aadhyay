import { INestApplicationContext, Logger } from '@nestjs/common';
import { createServer, Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { TokenService } from '../kernel/auth/token.service';
import { AccessService } from '../kernel/rbac/access.service';
import { TenantService } from '../kernel/tenancy/tenant.service';
import { DbService } from '../db/db.service';
import { MessengerService } from '../modules/messenger/messenger.service';
import { TransportService } from '../modules/transport/transport.service';
import { conversationMember, call, trackingLink, trip, studentTransport, studentGuardian } from '../db/schema';
import { Ctx, RequestCtx } from '../kernel/context/request-context';
import { RealtimeBus } from '../kernel/redis/realtime-bus';
import { sha256 } from '../common/crypto';
import { uuidv7 } from '../common/ids';
import { hasPermission } from '@aadhyay/contracts';
import { env } from '../config/env';

interface Authed { userId?: string; tenantId?: string; deviceId?: string; trackTripId?: string }

/**
 * Socket.IO server (docs/04 §3.2): /messenger, /calls, /transport. Horizontal scale via Redis adapter.
 * API/worker processes publish to Redis channel `aad:rt`; this process emits to rooms.
 */
export async function startRealtime(app: INestApplicationContext, port = env.REALTIME_PORT): Promise<{ io: Server; http: HttpServer; close: () => Promise<void> }> {
  const log = new Logger('Realtime');
  const tokens = app.get(TokenService), db = app.get(DbService), access = app.get(AccessService), tenants = app.get(TenantService);
  const messenger = app.get(MessengerService), transport = app.get(TransportService);
  const http = createServer((_, res) => { res.writeHead(200); res.end('ok'); });
  const io = new Server(http, { cors: { origin: true, credentials: true }, pingInterval: 20000, pingTimeout: 25000, maxHttpBufferSize: 2e6 });
  const pub = new Redis(env.REDIS_URL), sub = pub.duplicate(), bus = pub.duplicate();
  io.adapter(createAdapter(pub, sub, { key: `${env.REDIS_NAMESPACE}:socket.io` }));

  // Fan-out from API/worker processes
  await bus.subscribe(RealtimeBus.CHANNEL);
  bus.on('message', (_ch, raw) => {
    try {
      const m = JSON.parse(raw);
      io.of(m.ns).to(m.room).emit(m.event, m.payload);
    } catch {}
  });

  async function authUser(s: Socket): Promise<Authed> {
    const token = s.handshake.auth?.token as string | undefined;
    if (!token) throw new Error('unauthenticated');
    const c = await tokens.verify(token);
    if (c.typ !== 'access') throw new Error('unauthenticated');
    if (await pub.exists(`revoked:${c.sid}`)) throw new Error('revoked');
    return { userId: c.sub, tenantId: c.tid, deviceId: s.handshake.auth?.deviceId };
  }
  async function ctxFor(a: Authed): Promise<RequestCtx> {
    const ctx: RequestCtx = { requestId: uuidv7(), userId: a.userId };
    if (a.tenantId && a.userId) {
      const t = await tenants.byIdOrSlug(a.tenantId);
      const acc = await access.load(a.tenantId, a.userId);
      Object.assign(ctx, { tenantId: a.tenantId, tenantTz: t?.timezone, tenantSlug: t?.slug, permissions: new Set(acc?.permissions ?? []), personIds: acc?.personIds ?? {}, kinds: acc?.kinds ?? [], scopes: { all: acc?.scopes ?? [] } });
    }
    return ctx;
  }
  const run = <T>(ctx: RequestCtx, fn: () => Promise<T>) => Ctx.run(ctx, fn);

  // ---------------- /messenger ----------------
  const msg = io.of('/messenger');
  msg.use(async (s, next) => { try { (s.data as Authed) = await authUser(s); if (!s.data.deviceId) throw new Error('deviceId required'); next(); } catch (e: any) { next(new Error(e.message)); } });
  msg.on('connection', async (s) => {
    const a = s.data as Authed;
    s.join([`user:${a.userId}`, `device:${a.userId}:${a.deviceId}`]);
    const convs = await db.admin.select({ id: conversationMember.conversationId }).from(conversationMember).where(and(eq(conversationMember.userId, a.userId!), isNull(conversationMember.leftAt)));
    s.join(convs.map((c) => `conv:${c.id}`));
    await pub.set(`online:${a.userId}`, '1', 'EX', 60);
    const beat = setInterval(() => void pub.set(`online:${a.userId}`, '1', 'EX', 60), 30000);
    s.on('disconnect', () => clearInterval(beat));
    s.on('conversation.join', async (p: { conversationId: string }) => {
      const [m] = await db.admin.select().from(conversationMember).where(and(eq(conversationMember.conversationId, p.conversationId), eq(conversationMember.userId, a.userId!), isNull(conversationMember.leftAt)));
      if (m) s.join(`conv:${p.conversationId}`);
    });
    s.on('typing', (p: { conversationId: string; typing: boolean }) => {
      if (s.rooms.has(`conv:${p.conversationId}`)) s.to(`conv:${p.conversationId}`).emit('typing', { conversationId: p.conversationId, userId: a.userId, typing: !!p.typing });
    });
    s.on('envelope.ack', async (p: { envelopeIds: string[] }, cb?: (r: unknown) => void) => {
      const r = await run(await ctxFor(a), () => messenger.ack(a.deviceId!, p.envelopeIds ?? [])).catch((e) => ({ error: e.message }));
      cb?.(r);
    });
    s.on('receipt', async (p: { conversationId: string; messageIds: string[]; kind: 'delivered' | 'seen' }) => {
      await run(await ctxFor(a), () => messenger.receipt(p.conversationId, p.messageIds, p.kind)).catch(() => undefined);
    });
  });

  // ---------------- /calls (WebRTC signalling relay) ----------------
  const calls = io.of('/calls');
  calls.use(async (s, next) => { try { (s.data as Authed) = await authUser(s); next(); } catch (e: any) { next(new Error(e.message)); } });
  calls.on('connection', (s) => {
    const a = s.data as Authed;
    s.join(`user:${a.userId}`);
    const relay = (event: string) => s.on(event, async (p: { callId: string; toUserId: string; payload: unknown }) => {
      const [c] = await db.admin.select().from(call).where(eq(call.id, p.callId));
      if (!c || c.endedAt) return;
      const members = await db.admin.select({ u: conversationMember.userId }).from(conversationMember).where(and(eq(conversationMember.conversationId, c.conversationId), isNull(conversationMember.leftAt), inArray(conversationMember.userId, [a.userId!, p.toUserId])));
      if (members.length < 2) return;
      calls.to(`user:${p.toUserId}`).emit(event, { callId: p.callId, from: a.userId, payload: p.payload });
    });
    ['call.offer', 'call.answer', 'call.ice', 'call.reject', 'call.end'].forEach(relay);
  });

  // ---------------- /transport (driver pings + live map) ----------------
  const tr = io.of('/transport');
  tr.use(async (s, next) => {
    try {
      const trackToken = s.handshake.auth?.trackToken as string | undefined;
      if (trackToken) {
        const [l] = await db.admin.select().from(trackingLink).where(eq(trackingLink.tokenHash, sha256(trackToken)));
        if (!l || l.expiresAt < new Date()) throw new Error('expired');
        (s.data as Authed) = { trackTripId: l.tripId, tenantId: l.tenantId };
      } else (s.data as Authed) = await authUser(s);
      next();
    } catch (e: any) { next(new Error(e.message)); }
  });
  tr.on('connection', (s) => {
    const a = s.data as Authed;
    if (a.trackTripId) s.join(`trip:${a.trackTripId}`);
    s.on('trip.subscribe', async (p: { tripId: string }, cb?: (r: unknown) => void) => {
      if (!a.userId || !a.tenantId) return cb?.({ error: 'forbidden' });
      const ctx = await ctxFor(a);
      const ok = await run(ctx, async () => {
        if (hasPermission(ctx.permissions ?? [], 'transport.trip.view')) return true;
        const gid = ctx.personIds?.guardian;
        if (!gid) return false;
        const [t] = await db.t((tx) => tx.select().from(trip).where(eq(trip.id, p.tripId)));
        if (!t) return false;
        const kids = await db.t((tx) => tx.select({ s: studentGuardian.studentId }).from(studentGuardian).where(eq(studentGuardian.guardianId, gid)));
        if (!kids.length) return false;
        const [r] = await db.t((tx) => tx.select().from(studentTransport).where(and(eq(studentTransport.vehicleId, t.vehicleId), inArray(studentTransport.studentId, kids.map((k) => k.s)))).limit(1));
        return !!r;
      });
      if (ok) s.join(`trip:${p.tripId}`);
      cb?.({ ok });
    });
    s.on('trip.ping', async (p: { tripId: string; points: any[] }, cb?: (r: unknown) => void) => {
      if (!a.userId || !a.tenantId) return cb?.({ error: 'forbidden' });
      const r = await run(await ctxFor(a), () => transport.ping(p.tripId, p.points)).catch((e) => ({ error: e.message }));
      cb?.(r);
    });
  });

  await new Promise<void>((res) => http.listen(port, '0.0.0.0', () => res()));
  log.log(`Realtime on :${port} (namespaces /messenger /calls /transport)`);
  return {
    io, http,
    close: async () => {
      await new Promise<void>((res) => io.close(() => res()));
      pub.disconnect(); sub.disconnect(); bus.disconnect();
    },
  };
}
