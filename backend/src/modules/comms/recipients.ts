/**
 * Multi-child bus-link rule (docs/03 §6): one link per (guardian, vehicle, trip). Children of the same guardian on
 * the same vehicle share one link; different vehicles → separate links. Pure function for unit tests.
 */
export interface Rider { studentId: string; studentName: string; guardianId: string; vehicleId: string; stopId: string }
export function groupTrackingLinks(riders: Rider[]) {
  const map = new Map<string, { guardianId: string; vehicleId: string; studentIds: string[]; studentNames: string[]; stopIds: string[] }>();
  for (const r of riders) {
    const k = `${r.guardianId}|${r.vehicleId}`;
    const g = map.get(k) ?? { guardianId: r.guardianId, vehicleId: r.vehicleId, studentIds: [], studentNames: [], stopIds: [] };
    if (!g.studentIds.includes(r.studentId)) {
      g.studentIds.push(r.studentId);
      g.studentNames.push(r.studentName);
    }
    if (!g.stopIds.includes(r.stopId)) g.stopIds.push(r.stopId);
    map.set(k, g);
  }
  return [...map.values()];
}

/** Quiet hours check (HH:mm in tenant TZ). Window may wrap midnight. */
export function inQuietHours(nowHHmm: string, start = '21:00', end = '07:00') {
  return start <= end ? nowHHmm >= start && nowHHmm < end : nowHHmm >= start || nowHHmm < end;
}
export function msUntil(hhmm: string, tz: string, now = new Date()) {
  const cur = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const [ch, cm] = cur.split(':').map(Number);
  const [th, tm] = hhmm.split(':').map(Number);
  let mins = th! * 60 + tm! - (ch! * 60 + cm!);
  if (mins <= 0) mins += 1440;
  return mins * 60_000;
}
