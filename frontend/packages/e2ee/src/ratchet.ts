import { dhKeyPair, dh, kdf, mac, aeadEncrypt, aeadDecrypt, type KeyPair } from './primitives.js';
import { concatBytes, toB64, fromB64, utf8ToBytes } from './bytes.js';

const MAX_SKIP = 1000;

/** Serializable Double Ratchet session state (store encrypted at rest on the device). */
export interface RatchetState {
  DHs: { pub: string; priv: string };
  DHr: string | null;
  RK: string;
  CKs: string | null;
  CKr: string | null;
  Ns: number; Nr: number; PN: number;
  skipped: Record<string, string>; // `${dhPub}:${n}` → message key
  AD: string;
}
export interface Header { dh: string; pn: number; n: number }

const kp = (k: { pub: string; priv: string }): KeyPair => ({ pub: fromB64(k.pub), priv: fromB64(k.priv) });
const ser = (k: KeyPair) => ({ pub: toB64(k.pub), priv: toB64(k.priv) });

function kdfRK(rk: Uint8Array, dhOut: Uint8Array) {
  const o = kdf(dhOut, rk, 'AadhyayRatchet', 64);
  return { rk: o.subarray(0, 32), ck: o.subarray(32, 64) };
}
function kdfCK(ck: Uint8Array) {
  return { mk: mac(ck, Uint8Array.of(1)), ck: mac(ck, Uint8Array.of(2)) };
}
const headerBytes = (h: Header) => utf8ToBytes(JSON.stringify([h.dh, h.pn, h.n]));

/** Alice: after X3DH, using Bob's signed prekey as his first ratchet key. */
export function initAlice(SK: Uint8Array, bobRatchetPub: Uint8Array, AD: Uint8Array): RatchetState {
  const DHs = dhKeyPair();
  const { rk, ck } = kdfRK(SK, dh(DHs.priv, bobRatchetPub));
  return { DHs: ser(DHs), DHr: toB64(bobRatchetPub), RK: toB64(rk), CKs: toB64(ck), CKr: null, Ns: 0, Nr: 0, PN: 0, skipped: {}, AD: toB64(AD) };
}
/** Bob: his signed prekey pair is the initial ratchet key. */
export function initBob(SK: Uint8Array, bobSignedPreKey: KeyPair, AD: Uint8Array): RatchetState {
  return { DHs: ser(bobSignedPreKey), DHr: null, RK: toB64(SK), CKs: null, CKr: null, Ns: 0, Nr: 0, PN: 0, skipped: {}, AD: toB64(AD) };
}

export function ratchetEncrypt(s: RatchetState, plaintext: Uint8Array): { header: Header; ciphertext: Uint8Array } {
  if (!s.CKs) throw new Error('Sending chain not initialised');
  const { mk, ck } = kdfCK(fromB64(s.CKs));
  s.CKs = toB64(ck);
  const header: Header = { dh: s.DHs.pub, pn: s.PN, n: s.Ns };
  s.Ns += 1;
  return { header, ciphertext: aeadEncrypt(mk, plaintext, concatBytes(fromB64(s.AD), headerBytes(header))) };
}

function skipKeys(s: RatchetState, until: number) {
  if (!s.CKr) return;
  if (s.Nr + MAX_SKIP < until) throw new Error('Too many skipped messages');
  let ck = fromB64(s.CKr);
  while (s.Nr < until) {
    const o = kdfCK(ck);
    ck = o.ck;
    s.skipped[`${s.DHr}:${s.Nr}`] = toB64(o.mk);
    s.Nr += 1;
  }
  s.CKr = toB64(ck);
  const keys = Object.keys(s.skipped);
  if (keys.length > MAX_SKIP) for (const k of keys.slice(0, keys.length - MAX_SKIP)) delete s.skipped[k];
}

function dhRatchet(s: RatchetState, header: Header) {
  s.PN = s.Ns;
  s.Ns = 0;
  s.Nr = 0;
  s.DHr = header.dh;
  const r1 = kdfRK(fromB64(s.RK), dh(fromB64(s.DHs.priv), fromB64(s.DHr)));
  s.CKr = toB64(r1.ck);
  const DHs = dhKeyPair();
  s.DHs = ser(DHs);
  const r2 = kdfRK(r1.rk, dh(DHs.priv, fromB64(s.DHr)));
  s.RK = toB64(r2.rk);
  s.CKs = toB64(r2.ck);
}

/**
 * Decrypt with out-of-order support. Operates on a copy and only commits state on success
 * (a forged message cannot corrupt the session).
 */
export function ratchetDecrypt(state: RatchetState, header: Header, ciphertext: Uint8Array): { plaintext: Uint8Array; state: RatchetState } {
  const s: RatchetState = JSON.parse(JSON.stringify(state));
  const ad = concatBytes(fromB64(s.AD), headerBytes(header));
  const skippedKey = s.skipped[`${header.dh}:${header.n}`];
  if (skippedKey) {
    delete s.skipped[`${header.dh}:${header.n}`];
    return { plaintext: aeadDecrypt(fromB64(skippedKey), ciphertext, ad), state: s };
  }
  if (header.dh !== s.DHr) {
    skipKeys(s, header.pn);
    dhRatchet(s, header);
  }
  skipKeys(s, header.n);
  const { mk, ck } = kdfCK(fromB64(s.CKr!));
  s.CKr = toB64(ck);
  s.Nr += 1;
  return { plaintext: aeadDecrypt(mk, ciphertext, ad), state: s };
}
