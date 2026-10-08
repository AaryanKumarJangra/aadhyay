'use client';
/** Minimal IndexedDB key-value store (keys, sessions, message history live only on this device). */
const DB = 'aadhyay-messenger', STORE = 'kv';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
export const kv = {
  get: <T>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k) as IDBRequest<T | undefined>),
  set: (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k)),
  del: (k: string) => tx('readwrite', (s) => s.delete(k)),
};
