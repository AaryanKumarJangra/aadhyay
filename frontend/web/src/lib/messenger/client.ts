'use client';
import { io, type Socket } from 'socket.io-client';
import {
  generateIdentity, generateSignedPreKey, generateOneTimePreKeys, createOutgoingSession, encryptMessage, decryptMessage, markEstablished,
  toB64, fromB64, type Identity, type SessionRecord, type SignedPreKey, type OneTimePreKey,
} from '@aadhyay/e2ee';
import { kv } from './store';
import { call } from '../client';
import { REALTIME_URL } from '../config';

export interface ChatMessage { id: string; conversationId: string; from: string; text: string; at: string; status?: 'sent' | 'delivered' | 'seen'; mine?: boolean }
type Listener = (e: { type: 'message' | 'receipt' | 'conversation' | 'typing'; data: any }) => void;

const ser = (o: any) => JSON.parse(JSON.stringify(o, (_, v) => (v instanceof Uint8Array ? { __b: toB64(v) } : v)));
const deser = (o: any) => JSON.parse(JSON.stringify(o), (_, v) => (v && typeof v === 'object' && '__b' in v ? fromB64(v.__b) : v));

/**
 * Browser Messenger client: generates and keeps keys on this device only (IndexedDB), maintains a Double Ratchet
 * session per remote device, encrypts every message for every device of every member, decrypts incoming envelopes,
 * and acks them so the server deletes ciphertext.
 */
export class MessengerClient {
  socket?: Socket;
  private listeners = new Set<Listener>();
  private id!: Identity;
  private spk!: SignedPreKey;
  constructor(public userId: string, public deviceId: string) {}
  on(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
  private emit(type: any, data: any) { this.listeners.forEach((l) => l({ type, data })); }

  async init() {
    const saved = await kv.get<any>(`id:${this.userId}`);
    if (saved) { this.id = deser(saved.id); this.spk = deser(saved.spk); }
    else {
      this.id = generateIdentity();
      this.spk = generateSignedPreKey(this.id, 1);
      const opks = generateOneTimePreKeys(1, 100);
      await call('/messenger/devices', { body: { deviceId: this.deviceId, registrationId: this.id.registrationId, identityKey: toB64(this.id.dh.pub), signingKey: toB64(this.id.sig.pub), signedPreKey: { keyId: 1, publicKey: toB64(this.spk.keyPair.pub), signature: toB64(this.spk.signature) }, preKeys: opks.map((o) => ({ keyId: o.keyId, publicKey: toB64(o.keyPair.pub) })) } });
      await kv.set(`id:${this.userId}`, { id: ser(this.id), spk: ser(this.spk) });
      await kv.set(`opk:${this.userId}`, ser(opks));
    }
    const { token } = await (await fetch('/api/auth/token')).json();
    this.socket = io(`${REALTIME_URL}/messenger`, { auth: { token, deviceId: this.deviceId }, transports: ['websocket'] });
    this.socket.on('envelope.new', (e) => void this.receive(e));
    this.socket.on('receipt', (r) => { void this.applyReceipt(r); this.emit('receipt', r); });
    this.socket.on('conversation.new', (c) => this.emit('conversation', c));
    this.socket.on('typing', (t) => this.emit('typing', t));
    this.socket.on('connect', () => void this.drain());
    this.socket.on('prekeys.low', async () => {
      const opks = generateOneTimePreKeys(Date.now() % 1_000_000, 100);
      const all = deser((await kv.get(`opk:${this.userId}`)) ?? []).concat(opks);
      await kv.set(`opk:${this.userId}`, ser(all));
      await call('/messenger/prekeys', { body: { deviceId: this.deviceId, preKeys: opks.map((o) => ({ keyId: o.keyId, publicKey: toB64(o.keyPair.pub) })) } });
    });
  }

  private store() {
    return {
      signedPreKey: (k: number) => (k === this.spk.keyId ? this.spk : undefined),
      takeOneTimePreKey: (k: number) => (this.pendingOpks.find((o) => o.keyId === k) as OneTimePreKey | undefined),
    };
  }
  private pendingOpks: OneTimePreKey[] = [];

  private async session(remote: string) { const s = await kv.get<any>(`s:${this.userId}:${remote}`); return s ? (s as SessionRecord) : undefined; }
  private async saveSession(remote: string, s: SessionRecord) { await kv.set(`s:${this.userId}:${remote}`, s); }

  async history(conversationId: string): Promise<ChatMessage[]> { return (await kv.get<ChatMessage[]>(`h:${this.userId}:${conversationId}`)) ?? []; }
  private async append(m: ChatMessage) {
    const h = await this.history(m.conversationId);
    if (h.some((x) => x.id === m.id)) return;
    h.push(m);
    await kv.set(`h:${this.userId}:${m.conversationId}`, h.slice(-2000));
  }
  private async applyReceipt(r: { conversationId: string; messageIds: string[]; kind: 'delivered' | 'seen' }) {
    const h = await this.history(r.conversationId);
    await kv.set(`h:${this.userId}:${r.conversationId}`, h.map((m) => (r.messageIds.includes(m.id) && m.mine && m.status !== 'seen' ? { ...m, status: r.kind } : m)));
  }

  private async receive(e: any) {
    try {
      this.pendingOpks = deser((await kv.get(`opk:${this.userId}`)) ?? []);
      const remote = `${e.senderUserId}:${e.senderDeviceId}`;
      const r = decryptMessage(this.id, await this.session(remote), e.type, e.ciphertext, this.store());
      if (e.type === 1) await kv.set(`opk:${this.userId}`, ser(this.pendingOpks.filter((o) => o.keyId !== JSON.parse(new TextDecoder().decode(fromB64(e.ciphertext))).x3dh?.opk)));
      await this.saveSession(remote, r.session);
      const payload = JSON.parse(r.text);
      if (payload.t === 'text') {
        const m: ChatMessage = { id: e.messageId, conversationId: e.conversationId, from: e.senderUserId, text: payload.body, at: payload.ts ?? e.sentAt, mine: e.senderUserId === this.userId };
        await this.append(m);
        this.emit('message', m);
      }
      this.socket?.emit('envelope.ack', { envelopeIds: [e.id] });
    } catch (err) {
      console.warn('decrypt failed', err);
    }
  }
  async drain() {
    const pending = await call<any[]>(`/messenger/envelopes?deviceId=${this.deviceId}`);
    for (const e of pending) await this.receive(e);
  }

  /** Encrypt once per recipient device (and my other devices), then post the fan-out to the server. */
  async send(conversationId: string, memberUserIds: string[], text: string) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const body = JSON.stringify({ t: 'text', body: text, ts: new Date().toISOString() });
    const envelopes: any[] = [];
    for (const uid of new Set([...memberUserIds, this.userId])) {
      const bundles = await call<any[]>(`/messenger/keys/${uid}`).catch(() => []);
      for (const b of bundles) {
        if (uid === this.userId && b.deviceId === this.deviceId) continue;
        const remote = `${b.userId}:${b.deviceId}`;
        let s = await this.session(remote);
        if (!s || s.remoteIdentity !== b.identityKey) s = createOutgoingSession(this.id, b);
        const m = encryptMessage(s, body);
        await this.saveSession(remote, s);
        envelopes.push({ recipientUserId: b.userId, recipientDeviceId: b.deviceId, type: m.type, ciphertext: m.body });
      }
    }
    const mine: ChatMessage = { id, conversationId, from: this.userId, text, at: new Date().toISOString(), status: 'sent', mine: true };
    await this.append(mine);
    this.emit('message', mine);
    if (envelopes.length) await call('/messenger/messages', { body: { conversationId, messageId: id, senderDeviceId: this.deviceId, envelopes } });
    return mine;
  }
  markSeen(conversationId: string, messageIds: string[]) { if (messageIds.length) this.socket?.emit('receipt', { conversationId, messageIds, kind: 'seen' }); }
  typing(conversationId: string, typing: boolean) { this.socket?.emit('typing', { conversationId, typing }); }
  close() { this.socket?.close(); }
}
/** Once a peer replies, established sessions no longer carry the X3DH header. */
export { markEstablished };
