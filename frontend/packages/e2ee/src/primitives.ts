import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { concatBytes, randomBytes, utf8ToBytes } from './bytes.js';

export interface KeyPair { pub: Uint8Array; priv: Uint8Array }

export const dhKeyPair = (): KeyPair => {
  const priv = x25519.utils.randomSecretKey();
  return { priv, pub: x25519.getPublicKey(priv) };
};
export const signKeyPair = (): KeyPair => {
  const priv = ed25519.utils.randomSecretKey();
  return { priv, pub: ed25519.getPublicKey(priv) };
};
export const dh = (priv: Uint8Array, pub: Uint8Array) => x25519.getSharedSecret(priv, pub);
export const sign = (priv: Uint8Array, msg: Uint8Array) => ed25519.sign(msg, priv);
export const verify = (pub: Uint8Array, msg: Uint8Array, sig: Uint8Array) => {
  try {
    return ed25519.verify(sig, msg, pub);
  } catch {
    return false;
  }
};
export const kdf = (ikm: Uint8Array, salt: Uint8Array, info: string, len: number) => hkdf(sha256, ikm, salt, utf8ToBytes(info), len);
export const mac = (key: Uint8Array, data: Uint8Array) => hmac(sha256, key, data);
export { sha256, sha512, randomBytes };

/** AES-256-GCM with key+nonce derived from a one-time message key. */
export function aeadEncrypt(messageKey: Uint8Array, plaintext: Uint8Array, ad: Uint8Array) {
  const k = kdf(messageKey, new Uint8Array(32), 'AadhyayMessageKeys', 44);
  return gcm(k.subarray(0, 32), k.subarray(32, 44), ad).encrypt(plaintext);
}
export function aeadDecrypt(messageKey: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array) {
  const k = kdf(messageKey, new Uint8Array(32), 'AadhyayMessageKeys', 44);
  return gcm(k.subarray(0, 32), k.subarray(32, 44), ad).decrypt(ciphertext);
}
export const concat = concatBytes;
