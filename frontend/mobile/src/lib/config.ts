import Constants from 'expo-constants';
const extra = (Constants.expoConfig?.extra ?? {}) as { flavour: string; tenantSlug: string | null; apiBaseUrl: string; realtimeUrl: string; colors: { primary: string; accent: string } };
export const FLAVOUR = extra.flavour ?? 'aadhyay';
/** Locked flavours belong to one institution; the common app lets the user pick. */
export const LOCKED_TENANT = typeof extra.tenantSlug === 'string' && extra.tenantSlug ? extra.tenantSlug : null;
export const API = extra.apiBaseUrl ?? 'http://10.0.2.2:4000';
export const REALTIME = extra.realtimeUrl ?? 'http://10.0.2.2:4001';
export const COLORS = extra.colors ?? { primary: '#1E40AF', accent: '#F59E0B' };
