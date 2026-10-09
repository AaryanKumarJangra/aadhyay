import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/**
 * Durable outbox for actions that must survive bad connectivity (attendance registers, trip events).
 * Network/server errors stay pending and retry; a 4xx refusal is kept as "failed" with the server's reason —
 * nothing is ever dropped silently.
 */
export type QueueItem = { id: string; path: string; body: unknown; label: string; createdAt: string; status: 'pending' | 'failed'; error?: string };
const KEY = (q: string) => `outbox:${q}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export async function readQueue(q: string): Promise<QueueItem[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY(q))) ?? '[]'); } catch { return []; }
}
async function write(q: string, items: QueueItem[]) { await AsyncStorage.setItem(KEY(q), JSON.stringify(items)); notify(); }

export async function enqueue(q: string, path: string, body: unknown, label: string) {
  const items = await readQueue(q);
  items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, path, body, label, createdAt: new Date().toISOString(), status: 'pending' });
  await write(q, items);
}

/** Sends pending items in order. Returns how many were sent. */
export async function flush(q: string): Promise<number> {
  const items = await readQueue(q);
  let sent = 0;
  const left: QueueItem[] = [];
  for (const it of items) {
    if (it.status === 'failed') { left.push(it); continue; }
    try { await api(it.path, { body: it.body }); sent++; }
    catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408 && e.status !== 429) left.push({ ...it, status: 'failed', error: e.message });
      else left.push(it);
    }
  }
  await write(q, left);
  return sent;
}
export async function discard(q: string, id: string) { await write(q, (await readQueue(q)).filter((i) => i.id !== id)); }

export function useQueue(q: string) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const load = useCallback(() => { void readQueue(q).then(setItems); }, [q]);
  useEffect(() => { load(); listeners.add(load); return () => { listeners.delete(load); }; }, [load]);
  const retry = useCallback(async () => { setSyncing(true); try { await flush(q); } finally { setSyncing(false); } }, [q]);
  return { items, pending: items.filter((i) => i.status === 'pending').length, failed: items.filter((i) => i.status === 'failed').length, syncing, retry };
}
