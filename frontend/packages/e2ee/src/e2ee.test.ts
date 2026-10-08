import { describe, it, expect } from 'vitest';
import {
  generateIdentity, generateSignedPreKey, generateOneTimePreKeys, createOutgoingSession, encryptMessage, decryptMessage, markEstablished,
  createSenderKey, distribution, fromDistribution, groupEncrypt, groupDecrypt, encryptMedia, decryptMedia, safetyNumber, toB64, fromB64,
  type PreKeyBundle, type SessionRecord, utf8ToBytes,
} from './index.js';

function device(userId: string) {
  const id = generateIdentity();
  const spk = generateSignedPreKey(id, 1);
  const opks = generateOneTimePreKeys(100, 5);
  const store = {
    signedPreKey: (k: number) => (k === spk.keyId ? spk : undefined),
    takeOneTimePreKey: (k: number) => { const i = opks.findIndex((o) => o.keyId === k); return i >= 0 ? opks.splice(i, 1)[0] : undefined; },
  };
  const bundle = (withOpk = true): PreKeyBundle => ({
    userId, deviceId: `${userId}-d1`, registrationId: id.registrationId, identityKey: toB64(id.dh.pub), signingKey: toB64(id.sig.pub),
    signedPreKey: { keyId: spk.keyId, publicKey: toB64(spk.keyPair.pub), signature: toB64(spk.signature) },
    oneTimePreKey: withOpk && opks[0] ? { keyId: opks[0].keyId, publicKey: toB64(opks[0].keyPair.pub) } : null,
  });
  return { userId, id, spk, opks, store, bundle };
}

describe('X3DH + Double Ratchet', () => {
  it('Alice and Bob exchange messages both ways', () => {
    const alice = device('alice'), bob = device('bob');
    let aS: SessionRecord = createOutgoingSession(alice.id, bob.bundle());
    const m1 = encryptMessage(aS, 'Namaste Bob 🙏');
    expect(m1.type).toBe(1);
    const r1 = decryptMessage(bob.id, undefined, m1.type, m1.body, bob.store);
    expect(r1.text).toBe('Namaste Bob 🙏');
    expect(bob.opks.length).toBe(4); // one-time prekey consumed
    let bS = r1.session;
    const m2 = encryptMessage(bS, 'Hi Alice!');
    expect(m2.type).toBe(2);
    const r2 = decryptMessage(alice.id, aS, m2.type, m2.body, alice.store);
    expect(r2.text).toBe('Hi Alice!');
    aS = markEstablished(r2.session);
    for (let i = 0; i < 20; i++) {
      const a = encryptMessage(aS, `a${i}`);
      expect(a.type).toBe(2);
      const ra = decryptMessage(bob.id, bS, a.type, a.body, bob.store);
      expect(ra.text).toBe(`a${i}`);
      bS = ra.session;
      const b = encryptMessage(bS, `b${i}`);
      const rb = decryptMessage(alice.id, aS, b.type, b.body, alice.store);
      expect(rb.text).toBe(`b${i}`);
      aS = rb.session;
    }
  });

  it('handles out-of-order delivery', () => {
    const alice = device('alice'), bob = device('bob');
    const aS = createOutgoingSession(alice.id, bob.bundle());
    const msgs = [0, 1, 2, 3, 4].map((i) => encryptMessage(aS, `m${i}`));
    let bS = decryptMessage(bob.id, undefined, msgs[0]!.type, msgs[0]!.body, bob.store).session;
    for (const i of [3, 1, 4, 2]) {
      const r = decryptMessage(bob.id, bS, msgs[i]!.type, msgs[i]!.body, bob.store);
      expect(r.text).toBe(`m${i}`);
      bS = r.session;
    }
  });

  it('tampered ciphertext fails and does not corrupt the session', () => {
    const alice = device('alice'), bob = device('bob');
    const aS = createOutgoingSession(alice.id, bob.bundle());
    const m0 = encryptMessage(aS, 'first');
    const bS = decryptMessage(bob.id, undefined, m0.type, m0.body, bob.store).session;
    const m1 = encryptMessage(aS, 'secret');
    const wire = JSON.parse(new TextDecoder().decode(fromB64(m1.body)));
    const ct = fromB64(wire.c); ct[0] ^= 1; wire.c = toB64(ct);
    const forged = toB64(utf8ToBytes(JSON.stringify(wire)));
    expect(() => decryptMessage(bob.id, bS, m1.type, forged, bob.store)).toThrow();
    expect(decryptMessage(bob.id, bS, m1.type, m1.body, bob.store).text).toBe('secret');
  });

  it('works without a one-time prekey and rejects a forged signed prekey', () => {
    const alice = device('alice'), bob = device('bob');
    const s = createOutgoingSession(alice.id, bob.bundle(false));
    const m = encryptMessage(s, 'no opk');
    expect(decryptMessage(bob.id, undefined, m.type, m.body, bob.store).text).toBe('no opk');
    const evil = device('evil');
    const b = bob.bundle();
    b.signedPreKey.publicKey = toB64(evil.spk.keyPair.pub);
    expect(() => createOutgoingSession(alice.id, b)).toThrow('Invalid signed prekey signature');
  });
});

describe('group sender keys', () => {
  it('members decrypt; skipped iterations ok; tampering detected; replay rejected', () => {
    const mine = createSenderKey('grp-1');
    let theirs = fromDistribution(JSON.parse(JSON.stringify(distribution(mine))));
    const g1 = groupEncrypt(mine, 'Class 5A: PTM on Saturday');
    const g2 = groupEncrypt(mine, 'Bring report card');
    const g3 = groupEncrypt(mine, 'Thanks');
    const r3 = groupDecrypt(theirs, g3);
    expect(r3.text).toBe('Thanks');
    expect(() => groupDecrypt(r3.key, g1)).toThrow();
    theirs = fromDistribution(distribution({ ...mine, iteration: 0, chainKey: theirs.chainKey }));
    expect(groupDecrypt(theirs, g2).text).toBe('Bring report card');
    const m = JSON.parse(new TextDecoder().decode(fromB64(g1)));
    m.c = toB64(utf8ToBytes('xxxx'));
    expect(() => groupDecrypt(theirs, toB64(utf8ToBytes(JSON.stringify(m))))).toThrow('Bad group message signature');
  });
});

describe('media + safety numbers', () => {
  it('media roundtrip and digest check', () => {
    const data = utf8ToBytes('pretend this is a photo'.repeat(100));
    const { ciphertext, pointer } = encryptMedia(data);
    expect(decryptMedia(ciphertext, pointer)).toEqual(data);
    ciphertext[5] ^= 1;
    expect(() => decryptMedia(ciphertext, pointer)).toThrow('Media digest mismatch');
  });
  it('safety number identical on both sides and changes with keys', () => {
    const a = device('a'), b = device('b');
    const A = { userId: 'a', identityKey: toB64(a.id.dh.pub) }, B = { userId: 'b', identityKey: toB64(b.id.dh.pub) };
    expect(safetyNumber(A, B)).toBe(safetyNumber(B, A));
    expect(safetyNumber(A, B).replace(/ /g, '')).toMatch(/^\d{60}$/);
    expect(safetyNumber(A, { userId: 'b', identityKey: toB64(device('x').id.dh.pub) })).not.toBe(safetyNumber(A, B));
  });
});
