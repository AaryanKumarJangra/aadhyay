import { useSession } from './session';
import { COLORS } from './config';

/** Design tokens shared in spirit with the web console (light, premium, calm). Brand comes from the institution. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20 } as const;

/** Hex colour with alpha (0–1) → #RRGGBBAA. */
export const alpha = (hex: string, a: number) => `${hex.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

export function useTheme() {
  const brand = useSession((s) => s.branding?.primaryColor) ?? COLORS.primary;
  const accent = useSession((s) => s.branding?.accentColor) ?? COLORS.accent;
  return {
    brand, accent, brandSoft: alpha(brand, 0.09), brandLine: alpha(brand, 0.24),
    bg: '#F6F7FB', card: '#FFFFFF', sunken: '#F1F3F8', text: '#0F172A', text2: '#334155', muted: '#64748B', faint: '#94A3B8',
    line: '#E6E8EF', lineStrong: '#D5D9E2',
    ok: '#0D9488', okSoft: '#E6F6F4', warn: '#B45309', warnSoft: '#FDF4E3', bad: '#DC2626', badSoft: '#FDECEC', info: '#2563EB', infoSoft: '#E8F0FE',
  };
}
export type Theme = ReturnType<typeof useTheme>;

export const inr = (p?: number | null) => (p === null || p === undefined ? '—' : '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: p % 100 ? 2 : 0, minimumFractionDigits: p % 100 ? 2 : 0 }));
export const inrShort = (p: number) => { const r = p / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(1)}Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)}L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
