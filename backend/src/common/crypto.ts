import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

const key = Buffer.from(env.ENCRYPTION_KEY.slice(7), 'base64');
if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64)');

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function decrypt(token: string): string {
  const [v, iv, tag, ct] = token.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('bad ciphertext');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const hmacSha256 = (secret: string | Buffer, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');
/** Contact-discovery hash. Clients compute the same value (pepper delivered via /v1/messenger/config). */
export const phoneHash = (e164: string) => hmacSha256(env.PHONE_HASH_PEPPER, e164);
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
