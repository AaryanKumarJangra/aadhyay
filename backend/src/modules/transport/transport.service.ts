import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { vehicle, route, stop, studentTransport, trip, locationPing, tripEvent, trackingLink, student, guardian, studentGuardian, staff } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { RedisService } from '../../kernel/redis/redis.service';
import { RealtimeBus } from '../../kernel/redis/realtime-bus';
import { TokenService } from '../../kernel/auth/token.service';
import { CommsService, Recipient } from '../comms/comms.service';
import { groupTrackingLinks } from '../comms/recipients';
import { haversine, etaMinutes } from '../../common/geo';
import { sha256, randomToken } from '../../common/crypto';
import { badRequest, notFound, forbidden, AppError } from '../../common/errors';
import { env } from '../../config/env';
import { hasPermission } from '@aadhyay/contracts';
import { TenantService } from '../../kernel/tenancy/tenant.service';

const NEAR_STOP_M = 1000;
const OVERSPEED_MS = 60 / 3.6; // 60 km/h

@Injectable()
export class TransportService {
  constructor(
    private readonly db: DbService, private readonly events: EventsService, private readonly redis: RedisService, private readonly rt: RealtimeBus,
    private readonly tokens: TokenService, private readonly comms: CommsService, private readonly tenants: TenantService,
  ) {}

  async createRoute(b: { name: string; vehicleId?: string; stops: { name: string; lat: number; lng: number; order: number; pickupTime?: string; dropTime?: string; feePaise: number }[] }) {
    return this.db.t(async (tx) => {
      const [r] = await tx.insert(route).values({ tenantId: Ctx.tenantId(), name: b.name, vehicleId: b.vehicleId }).returning();
      const stops = b.stops.length ? await tx.insert(stop).values(b.stops.map((s) => ({ ...s, tenantId: Ctx.tenantId(), routeId: r!.id }))).returning() : [];
      return { ...r!, stops };
    });
  }
  async routes() {
    return this.db.t(async (tx) => {
      const rs = await tx.select().from(route).orderBy(asc(route.name));
      const ss = rs.length ? await tx.select().from(stop).where(inArray(stop.routeId, rs.map((r) => r.id))).orderBy(asc(stop.order)) : [];
      return rs.map((r) => ({ ...r, stops: ss.filter((s) => s.routeId === r.id) }));
    });
  }
  async assign(b: { studentId: string; direction: 'pickup' | 'drop'; routeId: string; stopId: string; vehicleId: string }) {
    const [r] = await this.db.t((tx) => tx.insert(studentTransport).values({ ...b, tenantId: Ctx.tenantId() })
      .onConflictDoUpdate({ target: [studentTransport.studentId, studentTransport.direction], set: { routeId: b.routeId, stopId: b.stopId, vehicleId: b.vehicleId, isActive: true } }).returning());
    return r;
  }
  async riders(vehicleId: string, direction: 'pickup' | 'drop') {
    return this.db.t((tx) => tx.select({ studentId: student.id, studentName: student.name, stopId: studentTransport.stopId, stopName: stop.name, stopOrder: stop.order })
      .from(studentTransport).innerJoin(student, eq(student.id, studentTransport.studentId)).innerJoin(stop, eq(stop.id, studentTransport.stopId))
      .where(and(eq(studentTransport.vehicleId, vehicleId), eq(studentTransport.direction, direction), eq(studentTransport.isActive, true), eq(student.status, 'active'))).orderBy(asc(stop.order)));
  }

  private async assertDriver(vehicleId: string) {
    const c = Ctx.get();
    if (hasPermission(c.permissions ?? [], 'transport.trip.manage')) return;
    const [v] = await this.db.t((tx) => tx.select().from(vehicle).where(eq(vehicle.id, vehicleId)));
    if (!v) throw notFound('Vehicle');
    const sid = c.personIds?.staff;
    if (!sid || (v.driverStaffId !== sid && v.attendantStaffId !== sid)) throw forbidden('You are not assigned to this vehicle');
  }

  /**
   * Start trip → one private tracking link per (guardian, vehicle, trip) covering all of that guardian's
   * children on this bus (docs/03 §6) → trip.started notification (push; WhatsApp only for parents without the app).
   */
  async startTrip(b: { vehicleId: string; routeId: string; direction: 'pickup' | 'drop' }) {
    await this.assertDriver(b.vehicleId);
    const tenantId = Ctx.tenantId();
    const [running] = await this.db.t((tx) => tx.select().from(trip).where(and(eq(trip.vehicleId, b.vehicleId), eq(trip.status, 'running'))).limit(1));
    if (running) throw new AppError('CONFLICT', 'A trip is already running for this vehicle', { tripId: running.id });
    const [v] = await this.db.t((tx) => tx.select().from(vehicle).where(eq(vehicle.id, b.vehicleId)));
    const [t] = await this.db.t((tx) => tx.insert(trip).values({ tenantId, vehicleId: b.vehicleId, routeId: b.routeId, direction: b.direction, driverUserId: Ctx.userId() }).returning());
    await this.db.t((tx) => tx.insert(tripEvent).values({ tenantId, tripId: t!.id, kind: 'started' }));
    const riders = await this.riders(b.vehicleId, b.direction);
    const gs = riders.length ? await this.db.t((tx) => tx.select({ studentId: studentGuardian.studentId, guardianId: guardian.id, userId: guardian.userId, phone: guardian.phone })
      .from(studentGuardian).innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId)).where(and(inArray(studentGuardian.studentId, riders.map((r) => r.studentId)), eq(studentGuardian.receivesNotifications, true)))) : [];
    const groups = groupTrackingLinks(gs.map((g) => { const r = riders.find((x) => x.studentId === g.studentId)!; return { studentId: g.studentId, studentName: r.studentName, guardianId: g.guardianId, vehicleId: b.vehicleId, stopId: r.stopId }; }));
    const ten = await this.tenants.byIdOrSlug(tenantId);
    const host = `${ten!.slug}.${env.APP_BASE_DOMAIN}`;
    const ttl = 4 * 3600;
    const recipients: Recipient[] = [];
    for (const g of groups) {
      const token = randomToken(16); // short opaque token (fits in SMS/WhatsApp); only its hash is stored
      await this.db.t((tx) => tx.insert(trackingLink).values({ tenantId, tripId: t!.id, guardianId: g.guardianId, vehicleId: b.vehicleId, studentIds: g.studentIds, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl * 1000) }).onConflictDoNothing());
      const gu = gs.find((x) => x.guardianId === g.guardianId)!;
      recipients.push({ userId: gu.userId, phone: gu.phone, vars: { children: g.studentNames.join(' & '), link: `https://${host}/track/${token}`, token } });
    }
    if (recipients.length) await this.comms.notify({ eventKey: 'trip.started', recipients, vars: { vehicle: v!.name ?? v!.regNo, direction: b.direction === 'pickup' ? 'to school' : 'to home' }, data: { tripId: t!.id } });
    await this.redis.setJson(`bus:${t!.id}`, { tripId: t!.id, vehicleId: b.vehicleId, startedAt: t!.startedAt }, ttl);
    return { trip: t, riders: riders.length, links: groups.length };
  }

  /** Batched GPS pings from driver app or device. Updates live position, geofences, overspeed. */
  async ping(tripId: string, points: { lat: number; lng: number; speed?: number; heading?: number; at: string }[]) {
    const tenantId = Ctx.tenantId();
    const [t] = await this.db.t((tx) => tx.select().from(trip).where(eq(trip.id, tripId)));
    if (!t || t.status !== 'running') throw badRequest('Trip is not running');
    await this.assertDriver(t.vehicleId);
    const pts = [...points].sort((a, b) => a.at.localeCompare(b.at));
    let dist = t.distanceM, prev = t.lastLat != null ? { lat: t.lastLat, lng: t.lastLng! } : null;
    for (const p of pts) { if (prev) dist += haversine(prev, p); prev = p; }
    const last = pts[pts.length - 1]!;
    await this.db.t(async (tx) => {
      await tx.insert(locationPing).values(pts.map((p) => ({ tenantId, tripId, lat: p.lat, lng: p.lng, speed: p.speed, heading: p.heading, at: new Date(p.at) })));
      await tx.update(trip).set({ lastLat: last.lat, lastLng: last.lng, lastAt: new Date(last.at), distanceM: dist }).where(eq(trip.id, tripId));
    });
    const pos = { tripId, lat: last.lat, lng: last.lng, speed: last.speed ?? null, heading: last.heading ?? null, at: last.at };
    await this.redis.setJson(`bus:pos:${tripId}`, pos, 4 * 3600);
    await this.rt.publish('/transport', `trip:${tripId}`, 'trip.position', pos);
    // Overspeed (one alert per 10 min)
    if ((last.speed ?? 0) > OVERSPEED_MS && (await this.redis.client.set(`overspeed:${tripId}`, '1', 'EX', 600, 'NX'))) {
      await this.db.t((tx) => tx.insert(tripEvent).values({ tenantId, tripId, kind: 'overspeed', data: { speedKmh: Math.round((last.speed ?? 0) * 3.6) } }));
    }
    // Near-stop alerts for each stop on the route (once per trip per stop)
    const stops = await this.db.t((tx) => tx.select().from(stop).where(eq(stop.routeId, t.routeId)));
    const riders = await this.riders(t.vehicleId, t.direction);
    const v = await this.db.t((tx) => tx.select().from(vehicle).where(eq(vehicle.id, t.vehicleId))).then((r) => r[0]);
    for (const s of stops) {
      const d = haversine(last, s);
      if (d > NEAR_STOP_M) continue;
      if (!(await this.redis.client.sadd(`nearstop:${tripId}`, s.id))) continue;
      await this.redis.client.expire(`nearstop:${tripId}`, 6 * 3600);
      const kids = riders.filter((r) => r.stopId === s.id).map((r) => r.studentId);
      await this.db.t((tx) => tx.insert(tripEvent).values({ tenantId, tripId, kind: 'near_stop', stopId: s.id, data: { distanceM: Math.round(d) } }));
      if (kids.length) {
        const recipients = (await this.comms.perChild(kids)).filter((r) => r.userId);
        await this.comms.notify({ eventKey: 'trip.near_stop', recipients, vars: { vehicle: v?.name ?? v?.regNo, stop: s.name, eta: etaMinutes(d, last.speed) }, data: { tripId, stopId: s.id } });
      }
    }
    return { ok: true, distanceM: Math.round(dist) };
  }

  async studentEvent(b: { tripId: string; studentId: string; kind: 'boarded' | 'dropped'; stopId?: string }) {
    const [t] = await this.db.t((tx) => tx.select().from(trip).where(eq(trip.id, b.tripId)));
    if (!t) throw notFound('Trip');
    await this.assertDriver(t.vehicleId);
    const tenantId = Ctx.tenantId();
    await this.db.t((tx) => tx.insert(tripEvent).values({ tenantId, tripId: b.tripId, kind: b.kind, studentId: b.studentId, stopId: b.stopId }));
    const [v] = await this.db.t((tx) => tx.select().from(vehicle).where(eq(vehicle.id, t.vehicleId)));
    const [s] = b.stopId ? await this.db.t((tx) => tx.select().from(stop).where(eq(stop.id, b.stopId!))) : [undefined];
    const time = new Date().toLocaleTimeString('en-IN', { timeZone: Ctx.get().tenantTz ?? 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    await this.comms.notify({ eventKey: b.kind === 'boarded' ? 'trip.boarded' : 'trip.dropped', recipients: await this.comms.perChild([b.studentId]), vars: { vehicle: v?.name ?? v?.regNo, stop: s?.name ?? '', time }, data: { tripId: b.tripId } });
    await this.rt.publish('/transport', `trip:${b.tripId}`, 'trip.event', { kind: b.kind, studentId: b.studentId, at: new Date().toISOString() });
    return { ok: true };
  }

  /** SOS: urgent alert to admins/transport managers + guardians of riders (push + WhatsApp + SMS fallback). */
  async sos(b: { tripId: string; lat?: number; lng?: number; note?: string }) {
    const [t] = await this.db.t((tx) => tx.select().from(trip).where(eq(trip.id, b.tripId)));
    if (!t) throw notFound('Trip');
    await this.assertDriver(t.vehicleId);
    const tenantId = Ctx.tenantId();
    await this.db.t((tx) => tx.insert(tripEvent).values({ tenantId, tripId: t.id, kind: 'sos', data: { lat: b.lat, lng: b.lng, note: b.note } }));
    const [v] = await this.db.t((tx) => tx.select().from(vehicle).where(eq(vehicle.id, t.vehicleId)));
    const riders = await this.riders(t.vehicleId, t.direction);
    const parents = await this.comms.perChild(riders.map((r) => r.studentId));
    const seen = new Set<string>();
    const recipients = [...(await this.comms.admins()), ...parents].filter((r) => { const k = r.userId ?? r.phone ?? ''; if (!k || seen.has(k)) return false; seen.add(k); return true; });
    await this.comms.notify({ eventKey: 'transport.sos', recipients, vars: { vehicle: v?.name ?? v?.regNo, note: b.note ?? '' }, urgent: true, data: { tripId: t.id, lat: b.lat, lng: b.lng } });
    await this.rt.publish('/transport', `trip:${t.id}`, 'trip.event', { kind: 'sos', at: new Date().toISOString() });
    await this.events.emit('transport.sos', { tripId: t.id, vehicleId: t.vehicleId });
    return { ok: true, notified: recipients.length };
  }

  async endTrip(tripId: string) {
    const [t] = await this.db.t((tx) => tx.select().from(trip).where(eq(trip.id, tripId)));
    if (!t) throw notFound('Trip');
    await this.assertDriver(t.vehicleId);
    await this.db.t(async (tx) => {
      await tx.update(trip).set({ status: 'ended', endedAt: new Date() }).where(eq(trip.id, tripId));
      await tx.update(trackingLink).set({ expiresAt: new Date(Date.now() + 15 * 60_000) }).where(eq(trackingLink.tripId, tripId));
      await tx.insert(tripEvent).values({ tenantId: Ctx.tenantId(), tripId, kind: 'ended' });
    });
    await this.rt.publish('/transport', `trip:${tripId}`, 'trip.event', { kind: 'ended', at: new Date().toISOString() });
    return { ok: true, distanceKm: Math.round(t.distanceM / 100) / 10 };
  }

  async liveTrips() {
    return this.db.t((tx) => tx.select({ id: trip.id, vehicleId: trip.vehicleId, regNo: vehicle.regNo, name: vehicle.name, direction: trip.direction, startedAt: trip.startedAt, lat: trip.lastLat, lng: trip.lastLng, lastAt: trip.lastAt, distanceM: trip.distanceM })
      .from(trip).innerJoin(vehicle, eq(vehicle.id, trip.vehicleId)).where(eq(trip.status, 'running')));
  }

  async tripReport(tripId: string) {
    return this.db.t(async (tx) => {
      const [t] = await tx.select().from(trip).where(eq(trip.id, tripId));
      if (!t) throw notFound('Trip');
      const evs = await tx.select().from(tripEvent).where(eq(tripEvent.tripId, tripId)).orderBy(asc(tripEvent.at));
      const path = await tx.select({ lat: locationPing.lat, lng: locationPing.lng, at: locationPing.at }).from(locationPing).where(eq(locationPing.tripId, tripId)).orderBy(asc(locationPing.at));
      return { trip: t, events: evs, path };
    });
  }

  /** Parent's view of their children's buses today (in-app live map, no WhatsApp needed). */
  async myBuses() {
    const kids = await this.db.t(async (tx) => {
      const gid = Ctx.get().personIds?.guardian;
      if (!gid) return [];
      return tx.select({ studentId: studentGuardian.studentId }).from(studentGuardian).where(eq(studentGuardian.guardianId, gid));
    });
    if (!kids.length) return [];
    return this.db.t((tx) => tx.select({ tripId: trip.id, vehicleId: trip.vehicleId, regNo: vehicle.regNo, direction: trip.direction, lat: trip.lastLat, lng: trip.lastLng, lastAt: trip.lastAt, studentId: studentTransport.studentId, stopId: studentTransport.stopId })
      .from(studentTransport).innerJoin(trip, and(eq(trip.vehicleId, studentTransport.vehicleId), eq(trip.direction, studentTransport.direction), eq(trip.status, 'running'))).innerJoin(vehicle, eq(vehicle.id, trip.vehicleId))
      .where(inArray(studentTransport.studentId, kids.map((k) => k.studentId))));
  }

  /** Public token view: only that bus, those children's stops, ETA. Token expires with the trip. */
  async publicTrack(token: string) {
    if (!/^[\w-]{16,64}$/.test(token)) throw new AppError('NOT_FOUND', 'Invalid link');
    const [l] = await this.db.admin.select().from(trackingLink).where(eq(trackingLink.tokenHash, sha256(token))).limit(1);
    if (!l || l.expiresAt < new Date()) throw new AppError('NOT_FOUND', 'This tracking link has expired');
    return Ctx.asTenant(l.tenantId, async () => {
      const [t] = await this.db.t((tx) => tx.select().from(trip).where(eq(trip.id, l.tripId)));
      const [v] = await this.db.t((tx) => tx.select({ regNo: vehicle.regNo, name: vehicle.name }).from(vehicle).where(eq(vehicle.id, l.vehicleId)));
      const mine = await this.db.t((tx) => tx.select({ stopId: studentTransport.stopId }).from(studentTransport).where(and(inArray(studentTransport.studentId, l.studentIds), eq(studentTransport.vehicleId, l.vehicleId), eq(studentTransport.direction, t!.direction))));
      const stops = mine.length ? await this.db.t((tx) => tx.select({ id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng, order: stop.order }).from(stop).where(inArray(stop.id, mine.map((m) => m.stopId)))) : [];
      const kids = await this.db.t((tx) => tx.select({ id: student.id, name: student.name }).from(student).where(inArray(student.id, l.studentIds)));
      const pos = (await this.redis.getJson<any>(`bus:pos:${l.tripId}`)) ?? (t?.lastLat != null ? { lat: t.lastLat, lng: t.lastLng, at: t.lastAt } : null);
      const evs = await this.db.t((tx) => tx.select({ kind: tripEvent.kind, studentId: tripEvent.studentId, at: tripEvent.at }).from(tripEvent).where(and(eq(tripEvent.tripId, l.tripId), inArray(tripEvent.kind, ['boarded', 'dropped', 'started', 'ended']))));
      return {
        tripId: l.tripId, status: t?.status, vehicle: v, children: kids.map((k) => ({ firstName: k.name.split(' ')[0], id: k.id })), position: pos,
        stops: stops.sort((a, b) => a.order - b.order).map((s) => ({ ...s, distanceM: pos ? Math.round(haversine(pos, s)) : null, etaMin: pos ? etaMinutes(haversine(pos, s), pos.speed) : null })),
        events: evs.filter((e) => !e.studentId || l.studentIds.includes(e.studentId)), expiresAt: l.expiresAt,
      };
    });
  }
}
