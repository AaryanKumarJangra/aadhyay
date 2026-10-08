import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { API, LOCKED_TENANT } from './config';

/** Tokens live in the OS keychain/keystore (SecureStore). Tiny observable store for UI state. */
interface State { accessToken?: string; refreshToken?: string; userId?: string; tenantSlug?: string | null; me?: any; branding?: any; deviceId?: string }
let state: State = {};
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const session = { get: () => state, set };
export function useSession<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
}

export async function boot() {
  const [refreshToken, tenantSlug, deviceId] = await Promise.all([SecureStore.getItemAsync('rt'), SecureStore.getItemAsync('tenant'), SecureStore.getItemAsync('device')]);
  const dev = deviceId ?? `m-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  if (!deviceId) await SecureStore.setItemAsync('device', dev);
  set({ refreshToken: refreshToken ?? undefined, tenantSlug: LOCKED_TENANT ?? tenantSlug, deviceId: dev });
  if (refreshToken) await refresh().catch(() => logout());
}
export async function saveLogin(j: { accessToken: string; refreshToken: string; user: { id: string } }) {
  await SecureStore.setItemAsync('rt', j.refreshToken);
  set({ accessToken: j.accessToken, refreshToken: j.refreshToken, userId: j.user.id });
}
export async function setTenant(slug: string | null) {
  if (slug) await SecureStore.setItemAsync('tenant', slug); else await SecureStore.deleteItemAsync('tenant');
  set({ tenantSlug: slug });
}
export async function refresh() {
  const r = await fetch(`${API}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: state.refreshToken }) });
  if (!r.ok) throw new Error('refresh failed');
  const j = await r.json();
  await SecureStore.setItemAsync('rt', j.refreshToken);
  set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
}
export async function logout() {
  if (state.accessToken) await fetch(`${API}/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${state.accessToken}` } }).catch(() => undefined);
  await SecureStore.deleteItemAsync('rt');
  set({ accessToken: undefined, refreshToken: undefined, me: undefined, userId: undefined });
}
