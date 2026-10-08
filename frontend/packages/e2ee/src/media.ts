import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { toB64, fromB64, equalBytes } from './bytes.js';

/** Encrypt a file on device before upload. The key + digest travel inside the E2EE message, never to the server. */
export function encryptMedia(data: Uint8Array) {
  const key = randomBytes(32), nonce = randomBytes(12);
  const ciphertext = gcm(key, nonce).encrypt(data);
  return { ciphertext, pointer: { key: toB64(key), nonce: toB64(nonce), sha256: toB64(sha256(ciphertext)), size: data.length } };
}
export function decryptMedia(ciphertext: Uint8Array, p: { key: string; nonce: string; sha256: string }) {
  if (!equalBytes(sha256(ciphertext), fromB64(p.sha256))) throw new Error('Media digest mismatch');
  return gcm(fromB64(p.key), fromB64(p.nonce)).decrypt(ciphertext);
}
