import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newSchool, uniquePhone, type Api } from './helpers';

let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

describe('transport: multi-child bus links, live tracking, geofence, SOS', () => {
  it('same bus → one link with both kids; different bus → separate link; public track works; near-stop alert', async () => {
    const s = await newSchool(api);
    const T = s.owner.token;
    const cls = await api.req('POST', '/academics/classes/with-sections', { token: T, body: { name: 'Class 3', order: 3, sections: ['A'] } });
    const parentPhone = uniquePhone();
    const mk = async (name: string) => (await api.req('POST', '/people/students', { token: T, body: { name, sectionId: cls.body.sections[0].id, guardians: [{ name: 'Parent', phone: parentPhone, relation: 'father' }] } })).body;
    const [a, b, c] = [await mk('Aditya Singh'), await mk('Aarohi Singh'), await mk('Arjun Singh')];
    // Driver staff with login
    const driverPhone = uniquePhone();
    const drv = await api.req('POST', '/people/staff', { token: T, body: { name: 'Raju Driver', phone: driverPhone, roleKeys: ['driver'] } });
    const v1 = await api.req('POST', '/transport/vehicles', { token: T, body: { regNo: 'UP15AB1234', name: 'Bus 1', capacity: 40, driverStaffId: drv.body.id } });
    const v2 = await api.req('POST', '/transport/vehicles', { token: T, body: { regNo: 'UP15AB9999', name: 'Bus 2', capacity: 40 } });
    const r1 = await api.req('POST', '/transport/routes', { token: T, body: { name: 'Route Shastri Nagar', vehicleId: v1.body.id, stops: [
      { name: 'Shastri Nagar Gate', lat: 28.9845, lng: 77.7064, order: 1 }, { name: 'Begum Bridge', lat: 28.9931, lng: 77.6986, order: 2 },
    ] } });
    const r2 = await api.req('POST', '/transport/routes', { token: T, body: { name: 'Route Modipuram', vehicleId: v2.body.id, stops: [{ name: 'Modipuram', lat: 29.07, lng: 77.71, order: 1 }] } });
    for (const [kid, veh, rt, st] of [[a, v1, r1, 0], [b, v1, r1, 1], [c, v2, r2, 0]] as const) {
      const x = await api.req('POST', '/transport/assign', { token: T, body: { studentId: kid.id, direction: 'pickup', routeId: rt.body.id, stopId: rt.body.stops[st].id, vehicleId: veh.body.id } });
      expect(x.status).toBe(201);
    }
    const driver = await api.login(driverPhone, 'Raju', s.slug);
    // Driver cannot start bus 2 (not assigned)
    const nope = await api.req('POST', '/transport/trips/start', { token: driver.token, body: { vehicleId: v2.body.id, routeId: r2.body.id, direction: 'pickup' } });
    expect(nope.status).toBe(403);
    const start = await api.req('POST', '/transport/trips/start', { token: driver.token, body: { vehicleId: v1.body.id, routeId: r1.body.id, direction: 'pickup' } });
    expect(start.status).toBe(201);
    expect(start.body).toMatchObject({ riders: 2, links: 1 });
    const start2 = await api.req('POST', '/transport/trips/start', { token: T, body: { vehicleId: v2.body.id, routeId: r2.body.id, direction: 'pickup' } });
    expect(start2.body).toMatchObject({ riders: 1, links: 1 });
    await api.drain();
    const parent = await api.login(parentPhone);
    const inbox = await api.req('GET', '/comms/inbox', { token: parent.token });
    const links = inbox.body.filter((n: any) => n.eventKey === 'trip.started');
    expect(links.length).toBe(2);
    const bus1 = links.find((n: any) => n.body.includes('Bus 1'));
    expect(bus1.body).toContain('Aditya Singh & Aarohi Singh');
    const token = bus1.body.match(/\/track\/([\w-]+)/)[1];
    // Drive near stop 2
    const ping = await api.req('POST', '/transport/trips/ping', { token: driver.token, body: { tripId: start.body.trip.id, points: [
      { lat: 28.9800, lng: 77.7100, speed: 8, at: new Date(Date.now() - 20000).toISOString() }, { lat: 28.9900, lng: 77.7000, speed: 9, at: new Date().toISOString() },
    ] } });
    expect(ping.status).toBe(201);
    const pub = await api.req('GET', `/public/track/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.vehicle.regNo).toBe('UP15AB1234');
    expect(pub.body.children.map((k: any) => k.firstName).sort()).toEqual(['Aarohi', 'Aditya']);
    expect(pub.body.position.lat).toBeCloseTo(28.99);
    expect(pub.body.stops.length).toBe(2);
    await api.drain();
    const inbox2 = await api.req('GET', '/comms/inbox', { token: parent.token });
    expect(inbox2.body.some((n: any) => n.eventKey === 'trip.near_stop')).toBe(true);
    // Boarded + SOS + end
    expect((await api.req('POST', '/transport/trips/student-event', { token: driver.token, body: { tripId: start.body.trip.id, studentId: a.id, kind: 'boarded' } })).status).toBe(201);
    const sos = await api.req('POST', '/transport/trips/sos', { token: driver.token, body: { tripId: start.body.trip.id, note: 'Tyre burst' } });
    expect(sos.body.notified).toBeGreaterThanOrEqual(2);
    expect((await api.req('POST', `/transport/trips/${start.body.trip.id}/end`, { token: driver.token })).status).toBe(201);
    const garbage = await api.req('GET', '/public/track/not-a-token');
    expect(garbage.status).toBe(404);
  });
});
