import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, type Socket } from 'socket.io-client';
import {
  generateIdentity, generateSignedPreKey, generateOneTimePreKeys, createOutgoingSession, encryptMessage, decryptMessage,
  toB64, fromB64, type Identity, type SessionRecord, type SignedPreKey, type OneTimePreKey,
} from '@aadhyay/e2ee';
import { api } from './api';
import { session } from './session';
import { REALTIME } from './config';

export interface Msg { id: string; conversationId: string; from: string; text: string; at: string; mine?: boolean; status?: string }
const ser = (o: any) => JSON.stringify(o, (_, v) => (v instanceof Uint8Array ? { __b: toB64(v) } : v));
const deser = (s: string) => JSON.parse(s, (_, v) => (v && typeof v === 'object' && '__b' in v ? fromB64(v.__b) : v));

/**
 * Mobile E2EE messenger client. Identity + signed prekey in SecureStore (Keychain/Keystore);
 * ratchet sessions and message history on-device (AsyncStorage). Server only relays ciphertext.
 */
class Messenger {
  socket?: Socket;
  private id!: Identity; private spk!: SignedPreKey;
  private listeners = new Set<(e: { type: string; data: any }) => void>();
  private uid = () => session.get().userId!;
  private dev = () => session.get().deviceId!;
  on(f: (e: { type: string; data: any }) => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  private emit(type: string, data: any) { this.listeners.forEach((f) => f({ type, data })); }

  async init() {
    if (this.socket) return;
    const saved = await SecureStore.getItemAsync(`e2ee-${this.uid()}`);
    if (saved) { const x = deser(saved); this.id = x.id; this.spk = x.spk; }
    else {
      this.id = generateIdentity();
      this.spk = generateSignedPreKey(this.id, 1);
      const opks = generateOneTimePreKeys(1, 100);
      await api('/messenger/devices', { body: { deviceId: this.dev(), registrationId: this.id.registrationId, identityKey: toB64(this.id.dh.pub), signingKey: toB64(this.id.sig.pub), signedPreKey: { keyId: 1, publicKey: toB64(this.spk.keyPair.pub), signature: toB64(this.spk.signature) }, preKeys: opks.map((o) => ({ keyId: o.keyId, publicKey: toB64(o.keyPair.pub) })) } });
      await SecureStore.setItemAsync(`e2ee-${this.uid()}`, ser({ id: this.id, spk: this.spk }));
      await AsyncStorage.setItem(`opk-${this.uid()}`, ser(opks));
    }
    this.socket = io(`${REALTIME}/messenger`, { auth: { token: session.get().accessToken, deviceId: this.dev() }, transports: ['websocket'] });
    this.socket.on('envelope.new', (e) => void this.receive(e));
    this.socket.on('receipt', (r) => this.emit('receipt', r));
    this.socket.on('typing', (t) => this.emit('typing', t));
    this.socket.on('conversation.new', (c) => this.emit('conversation', c));
    this.socket.on('connect', () => void this.drain());
  }
  async history(cid: string): Promise<Msg[]> { return JSON.parse((await AsyncStorage.getItem(`h-${this.uid()}-${cid}`)) ?? '[]'); }
  private async append(m: Msg) { const h = await this.history(m.conversationId); if (!h.some((x) => x.id === m.id)) { h.push(m); await AsyncStorage.setItem(`h-${this.uid()}-${m.conversationId}`, JSON.stringify(h.slice(-3000))); } }
  private async sess(k: string): Promise<SessionRecord | undefined> { const s = await AsyncStorage.getItem(`s-${this.uid()}-${k}`); return s ? JSON.parse(s) : undefined; }
  private async saveSess(k: string, s: SessionRecord) { await AsyncStorage.setItem(`s-${this.uid()}-${k}`, JSON.stringify(s)); }
  private async receive(e: any) {
    try {
      const opks: OneTimePreKey[] = deser((await AsyncStorage.getItem(`opk-${this.uid()}`)) ?? '[]');
      const store = { signedPreKey: (k: number) => (k === this.spk.keyId ? this.spk : undefined), takeOneTimePreKey: (k: number) => { const i = opks.findIndex((o) => o.keyId === k); return i >= 0 ? opks.splice(i, 1)[0] : undefined; } };
      const key = `${e.senderUserId}:${e.senderDeviceId}`;
      const r = decryptMessage(this.id, await this.sess(key), e.type, e.ciphertext, store);
      await AsyncStorage.setItem(`opk-${this.uid()}`, ser(opks));
      await this.saveSess(key, r.session);
      const p = JSON.parse(r.text);
      if (p.t === 'text') { const m: Msg = { id: e.messageId, conversationId: e.conversationId, from: e.senderUserId, text: p.body, at: p.ts ?? e.sentAt, mine: e.senderUserId === this.uid() }; await this.append(m); this.emit('message', m); }
      this.socket?.emit('envelope.ack', { envelopeIds: [e.id] });
    } catch (err) { console.warn('decrypt failed', err); }
  }
  async drain() { for (const e of await api<any[]>(`/messenger/envelopes?deviceId=${this.dev()}`)) await this.receive(e); }
  async send(cid: string, members: string[], text: string) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const body = JSON.stringify({ t: 'text', body: text, ts: new Date().toISOString() });
    const envelopes: any[] = [];
    for (const u of new Set([...members, this.uid()])) {
      for (const b of await api<any[]>(`/messenger/keys/${u}`).catch(() => [])) {
        if (u === this.uid() && b.deviceId === this.dev()) continue;
        const k = `${b.userId}:${b.deviceId}`;
        let s = await this.sess(k);
        if (!s || s.remoteIdentity !== b.identityKey) s = createOutgoingSession(this.id, b);
        const m = encryptMessage(s, body);
        await this.saveSess(k, s);
        envelopes.push({ recipientUserId: b.userId, recipientDeviceId: b.deviceId, type: m.type, ciphertext: m.body });
      }
    }
    const mine: Msg = { id, conversationId: cid, from: this.uid(), text, at: new Date().toISOString(), mine: true, status: 'sent' };
    await this.append(mine); this.emit('message', mine);
    if (envelopes.length) await api('/messenger/messages', { body: { conversationId: cid, messageId: id, senderDeviceId: this.dev(), envelopes } });
  }
  seen(cid: string, ids: string[]) { if (ids.length) this.socket?.emit('receipt', { conversationId: cid, messageIds: ids, kind: 'seen' }); }
  typing(cid: string, typing: boolean) { this.socket?.emit('typing', { conversationId: cid, typing }); }
}
export const messenger = new Messenger();
