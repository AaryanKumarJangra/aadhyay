import { signKeyPair, sign, verify, mac, aeadEncrypt, aeadDecrypt, randomBytes } from './primitives.js';
import { toB64, fromB64, utf8ToBytes, utf8Decode } from './bytes.js';

/**
 * Sender Keys for groups: each member has a chain key + signing key per group. The distribution message
 * is sent to every member over their pairwise (Double Ratchet) session; group messages are then encrypted
 * once and fanned out by the server. Rotate (new SenderKey) whenever a member leaves.
 */
export interface SenderKey { groupId: string; keyId: number; iteration: number; chainKey: string; signing: { pub: string; priv?: string } }
export interface SenderKeyDistribution { groupId: string; keyId: number; iteration: number; chainKey: string; signingPub: string }

export function createSenderKey(groupId: string): SenderKey {
  const s = signKeyPair();
  return { groupId, keyId: Math.floor(Math.random() * 2 ** 31), iteration: 0, chainKey: toB64(randomBytes(32)), signing: { pub: toB64(s.pub), priv: toB64(s.priv) } };
}
export function distribution(k: SenderKey): SenderKeyDistribution {
  return { groupId: k.groupId, keyId: k.keyId, iteration: k.iteration, chainKey: k.chainKey, signingPub: k.signing.pub };
}
export function fromDistribution(d: SenderKeyDistribution): SenderKey {
  return { groupId: d.groupId, keyId: d.keyId, iteration: d.iteration, chainKey: d.chainKey, signing: { pub: d.signingPub } };
}

function step(ck: Uint8Array) {
  return { mk: mac(ck, Uint8Array.of(1)), ck: mac(ck, Uint8Array.of(2)) };
}

export function groupEncrypt(k: SenderKey, plaintext: string | Uint8Array): string {
  if (!k.signing.priv) throw new Error('Not my sender key');
  const { mk, ck } = step(fromB64(k.chainKey));
  const it = k.iteration;
  k.chainKey = toB64(ck);
  k.iteration += 1;
  const ad = utf8ToBytes(`${k.groupId}:${k.keyId}:${it}`);
  const ct = aeadEncrypt(mk, typeof plaintext === 'string' ? utf8ToBytes(plaintext) : plaintext, ad);
  const sig = sign(fromB64(k.signing.priv), ct);
  return toB64(utf8ToBytes(JSON.stringify({ g: k.groupId, k: k.keyId, i: it, c: toB64(ct), s: toB64(sig) })));
}

/** Decrypt a group message using the sender's key (advances it; supports skipping ahead up to 2000). */
export function groupDecrypt(k: SenderKey, body: string): { text: string; plaintext: Uint8Array; key: SenderKey } {
  const m = JSON.parse(utf8Decode(fromB64(body)));
  if (m.g !== k.groupId || m.k !== k.keyId) throw new Error('Sender key mismatch');
  const ct = fromB64(m.c);
  if (!verify(fromB64(k.signing.pub), ct, fromB64(m.s))) throw new Error('Bad group message signature');
  if (m.i < k.iteration) throw new Error('Old or duplicate message');
  if (m.i - k.iteration > 2000) throw new Error('Too far ahead');
  let ck = fromB64(k.chainKey);
  let mk = new Uint8Array();
  for (let i = k.iteration; i <= m.i; i++) {
    const o = step(ck);
    mk = o.mk;
    ck = o.ck;
  }
  const plaintext = aeadDecrypt(mk, ct, utf8ToBytes(`${k.groupId}:${k.keyId}:${m.i}`));
  return { plaintext, text: utf8Decode(plaintext), key: { ...k, chainKey: toB64(ck), iteration: m.i + 1 } };
}
