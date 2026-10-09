/** Categorical series colours in the validated fixed order. Colour follows the entity, never its rank. */
export const SERIES = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)', 'var(--color-series-5)', 'var(--color-series-6)', 'var(--color-series-7)', 'var(--color-series-8)'];

/** "Nice" axis ticks from 0 to ≥ max: 0, 250, 500 … (3–5 ticks). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

/** 1,284 · 12.9K · 4.2L · 1.3Cr (Indian grouping for large values). */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `${trim(n / 1e7)}Cr`;
  if (a >= 1e5) return `${trim(n / 1e5)}L`;
  if (a >= 1e4) return `${trim(n / 1e3)}K`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}
const trim = (x: number) => (Math.round(x * 10) / 10).toLocaleString('en-IN', { maximumFractionDigits: 1 });

/** ₹ amount from paise, compact for axes and tiles: ₹8.4L. */
export const rupeesCompact = (paise: number) => `₹${compact(paise / 100)}`;

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
  return '﻿' + [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type FormatName = 'number' | 'inr' | 'pct';
export type Format = FormatName | ((n: number) => string);
/** Named formats can cross the server→client boundary; functions cannot. `inr` takes paise. */
export function fmt(f: Format | undefined): (n: number) => string {
  if (typeof f === 'function') return f;
  if (f === 'inr') return rupeesCompact;
  if (f === 'pct') return (n) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
  return compact;
}
