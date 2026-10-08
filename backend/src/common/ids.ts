import { randomBytes } from 'node:crypto';

/** RFC 9562 UUID v7: 48-bit unix ms timestamp + random. Time-sortable, index friendly. */
export function uuidv7(): string {
  const b = randomBytes(16);
  const ts = BigInt(Date.now());
  b[0] = Number((ts >> 40n) & 0xffn);
  b[1] = Number((ts >> 32n) & 0xffn);
  b[2] = Number((ts >> 24n) & 0xffn);
  b[3] = Number((ts >> 16n) & 0xffn);
  b[4] = Number((ts >> 8n) & 0xffn);
  b[5] = Number(ts & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** Short human-friendly random code (no ambiguous chars). */
export function shortCode(len = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[bytes[i]! % alphabet.length];
  return s;
}
