/** All DB timestamps are UTC; business dates are evaluated in the tenant timezone (default IST). */
export function todayIn(tz = 'Asia/Kolkata', d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
export function hourIn(tz = 'Asia/Kolkata', d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(d));
}
export const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
export const DAY = 86400000;
