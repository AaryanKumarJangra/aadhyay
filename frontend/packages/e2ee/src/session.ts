import { x3dhInitiate, x3dhRespond, type Identity, type PreKeyBundle, type SignedPreKey, type OneTimePreKey, type X3DHHeader } from './x3dh.js';
import { initAlice, initBob, ratchetEncrypt, ratchetDecrypt, type RatchetState, type Header } from './ratchet.js';
import { toB64, fromB64, utf8ToBytes, utf8Decode } from './bytes.js';

/**
 * Wire envelope types (match server `messenger_envelopes.type`):
 *   1 = PreKey message (first message, carries X3DH header), 2 = normal ratchet message,
 *   3 = sender-key group message, 4 = control (receipts, sender-key distribution, call signalling).
 */
export interface WireMessage { v: 1; x3dh?: X3DHHeader; h: Header; c: string }

export interface SessionRecord { state: RatchetState; remoteIdentity: string; remoteSigning?: string; pendingPreKey?: X3DHHeader }

/** Start an outgoing session from a fetched bundle. */
export function createOutgoingSession(me: Identity, bundle: PreKeyBundle): SessionRecord {
  const x = x3dhInitiate(me, bundle);
  return { state: initAlice(x.SK, x.remoteSignedPreKey, x.AD), remoteIdentity: bundle.identityKey, remoteSigning: bundle.signingKey, pendingPreKey: x.header };
}

export function encryptMessage(session: SessionRecord, plaintext: string | Uint8Array): { type: 1 | 2; body: string } {
  const pt = typeof plaintext === 'string' ? utf8ToBytes(plaintext) : plaintext;
  const { header, ciphertext } = ratchetEncrypt(session.state, pt);
  const msg: WireMessage = { v: 1, h: header, c: toB64(ciphertext), ...(session.pendingPreKey ? { x3dh: session.pendingPreKey } : {}) };
  return { type: session.pendingPreKey ? 1 : 2, body: toB64(utf8ToBytes(JSON.stringify(msg))) };
}

export interface PreKeyStore {
  signedPreKey(keyId: number): SignedPreKey | undefined;
  takeOneTimePreKey(keyId: number): OneTimePreKey | undefined; // must delete after use
}

/**
 * Decrypt an incoming envelope. For type 1, a new session is created from the X3DH header.
 * Returns the (possibly new) session to persist. On the first successful reply the sender's
 * `pendingPreKey` should be cleared (call `markEstablished`).
 */
export function decryptMessage(me: Identity, existing: SessionRecord | undefined, type: number, body: string, prekeys: PreKeyStore): { plaintext: Uint8Array; text: string; session: SessionRecord } {
  const msg = JSON.parse(utf8Decode(fromB64(body))) as WireMessage;
  let session = existing;
  if (type === 1 && msg.x3dh && (!session || session.remoteIdentity !== msg.x3dh.ik || session.state.DHr !== msg.h.dh)) {
    const spk = prekeys.signedPreKey(msg.x3dh.spk);
    if (!spk) throw new Error('Unknown signed prekey');
    const opk = msg.x3dh.opk !== null ? prekeys.takeOneTimePreKey(msg.x3dh.opk) ?? null : null;
    const r = x3dhRespond(me, spk, opk, msg.x3dh);
    session = { state: initBob(r.SK, spk.keyPair, r.AD), remoteIdentity: msg.x3dh.ik, remoteSigning: msg.x3dh.isig };
  }
  if (!session) throw new Error('No session for message');
  const { plaintext, state } = ratchetDecrypt(session.state, msg.h, fromB64(msg.c));
  const next: SessionRecord = { ...session, state };
  return { plaintext, text: utf8Decode(plaintext), session: next };
}

/** Once the peer has replied, stop attaching the X3DH header. */
export function markEstablished(s: SessionRecord): SessionRecord {
  const { pendingPreKey, ...rest } = s;
  return rest;
}
