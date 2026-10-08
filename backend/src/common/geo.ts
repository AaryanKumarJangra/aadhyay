/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** ETA in minutes from distance (m) and speed (m/s); falls back to 18 km/h city average. */
export function etaMinutes(distM: number, speedMs?: number | null) {
  const v = speedMs && speedMs > 1.5 ? speedMs : 5;
  return Math.max(1, Math.round(distM / v / 60));
}
