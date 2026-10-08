import { sha512 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes, fromB64 } from './bytes.js';

/** 60-digit safety number (two 30-digit halves), same on both phones; compare in person or by QR. */
export function safetyNumber(a: { userId: string; identityKey: string }, b: { userId: string; identityKey: string }) {
  const part = (x: { userId: string; identityKey: string }) => {
    let h = concatBytes(utf8ToBytes(x.userId), fromB64(x.identityKey));
    for (let i = 0; i < 5200; i++) h = sha512(concatBytes(h, fromB64(x.identityKey)));
    let digits = '';
    for (let i = 0; i < 30; i += 5) {
      const n = ((h[i]! * 2 ** 32 + ((h[i + 1]! << 24) | (h[i + 2]! << 16) | (h[i + 3]! << 8) | h[i + 4]!)) >>> 0) % 100000;
      digits += String(n).padStart(5, '0');
    }
    return digits;
  };
  const [p, q] = [part(a), part(b)].sort();
  return `${p}${q}`.replace(/(\d{5})/g, '$1 ').trim();
}
