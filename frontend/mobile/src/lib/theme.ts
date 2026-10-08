import { useColorScheme } from 'react-native';
import { useSession } from './session';
import { COLORS } from './config';

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  const brand = useSession((s) => s.branding?.primaryColor) ?? COLORS.primary;
  return {
    dark, brand, accent: COLORS.accent,
    bg: dark ? '#020617' : '#F8FAFC', card: dark ? '#0F172A' : '#FFFFFF', text: dark ? '#E2E8F0' : '#0F172A',
    muted: dark ? '#94A3B8' : '#64748B', line: dark ? '#1E293B' : '#E2E8F0', ok: '#16A34A', bad: '#DC2626', warn: '#D97706',
  };
}
export const inr = (p?: number | null) => (p === null || p === undefined ? '—' : '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: p % 100 ? 2 : 0, minimumFractionDigits: p % 100 ? 2 : 0 }));
