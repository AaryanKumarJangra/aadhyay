import { dhKeyPair, signKeyPair, dh, sign, verify, kdf, type KeyPair } from './primitives.js';
import { concatBytes, toB64, fromB64 } from './bytes.js';

/** Long-term device identity: X25519 for agreement + Ed25519 for signing prekeys. */
export interface Identity { dh: KeyPair; sig: KeyPair; registrationId: number }
export interface SignedPreKey { keyId: number; keyPair: KeyPair; signature: Uint8Array }
export interface OneTimePreKey { keyId: number; keyPair: KeyPair }

/** Public bundle fetched from the server for each recipient device. */
export interface PreKeyBundle {
  userId: string; deviceId: string; registrationId: number;
  identityKey: string; signingKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string };
  oneTimePreKey?: { keyId: number; publicKey: string } | null;
}

export function generateIdentity(): Identity {
  return { dh: dhKeyPair(), sig: signKeyPair(), registrationId: Math.floor(Math.random() * 16380) + 1 };
}
export function generateSignedPreKey(id: Identity, keyId: number): SignedPreKey {
  const keyPair = dhKeyPair();
  return { keyId, keyPair, signature: sign(id.sig.priv, keyPair.pub) };
}
export function generateOneTimePreKeys(startId: number, count: number): OneTimePreKey[] {
  return Array.from({ length: count }, (_, i) => ({ keyId: startId + i, keyPair: dhKeyPair() }));
}

const F = new Uint8Array(32).fill(0xff);
const ZERO = new Uint8Array(32);

/** Initiator (Alice) side of X3DH. Throws if the signed prekey signature is invalid. */
export function x3dhInitiate(alice: Identity, bundle: PreKeyBundle) {
  const IKb = fromB64(bundle.identityKey), SIGb = fromB64(bundle.signingKey);
  const SPKb = fromB64(bundle.signedPreKey.publicKey);
  if (!verify(SIGb, SPKb, fromB64(bundle.signedPreKey.signature))) throw new Error('Invalid signed prekey signature');
  const EK = dhKeyPair();
  const parts = [F, dh(alice.dh.priv, SPKb), dh(EK.priv, IKb), dh(EK.priv, SPKb)];
  if (bundle.oneTimePreKey) parts.push(dh(EK.priv, fromB64(bundle.oneTimePreKey.publicKey)));
  const SK = kdf(concatBytes(...parts), ZERO, 'AadhyayX3DH', 32);
  const AD = concatBytes(alice.dh.pub, IKb);
  return {
    SK, AD, remoteSignedPreKey: SPKb,
    header: { ik: toB64(alice.dh.pub), isig: toB64(alice.sig.pub), ek: toB64(EK.pub), spk: bundle.signedPreKey.keyId, opk: bundle.oneTimePreKey?.keyId ?? null },
  };
}
export type X3DHHeader = ReturnType<typeof x3dhInitiate>['header'];

/** Responder (Bob) side. Caller supplies own signed prekey and the one-time prekey referenced (then deletes it). */
export function x3dhRespond(bob: Identity, spk: SignedPreKey, opk: OneTimePreKey | null, h: X3DHHeader) {
  const IKa = fromB64(h.ik), EKa = fromB64(h.ek);
  const parts = [F, dh(spk.keyPair.priv, IKa), dh(bob.dh.priv, EKa), dh(spk.keyPair.priv, EKa)];
  if (h.opk !== null) {
    if (!opk || opk.keyId !== h.opk) throw new Error('One-time prekey missing');
    parts.push(dh(opk.keyPair.priv, EKa));
  }
  const SK = kdf(concatBytes(...parts), ZERO, 'AadhyayX3DH', 32);
  return { SK, AD: concatBytes(IKa, bob.dh.pub), remoteIdentity: IKa, remoteSigning: fromB64(h.isig) };
}
