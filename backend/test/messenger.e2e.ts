import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect, Socket } from 'socket.io-client';
import {
  generateIdentity, generateSignedPreKey, generateOneTimePreKeys, createOutgoingSession, encryptMessage, decryptMessage, toB64,
  type Identity, type SessionRecord,
} from '@aadhyay/e2ee';
import { setup, uniquePhone, type Api } from './helpers';
import { startRealtime } from '../src/realtime/realtime.server';

let api: Api;
let rt: Awaited<ReturnType<typeof startRealtime>>;
const PORT = 4911;
beforeAll(async () => { api = await setup(); rt = await startRealtime(api.app, PORT); });
afterAll(async () => { await rt.close(); await api.close(); });

/** A simulated phone: keys, sessions, socket. */
async function phoneClient(name: string) {
  const phone = uniquePhone();
  const login = await api.login(phone, name);
  const deviceId = `dev-${name}-${Date.now()}`;
  const id: Identity = generateIdentity();
  const spk = generateSignedPreKey(id, 1);
  const opks = generateOneTimePreKeys(1, 20);
  const reg = await api.req('POST', '/messenger/devices', { token: login.token, body: {
    deviceId, registrationId: id.registrationId, identityKey: toB64(id.dh.pub), signingKey: toB64(id.sig.pub),
    signedPreKey: { keyId: spk.keyId, publicKey: toB64(spk.keyPair.pub), signature: toB64(spk.signature) },
    preKeys: opks.map((o) => ({ keyId: o.keyId, publicKey: toB64(o.keyPair.pub) })),
  } });
  expect(reg.status).toBe(201);
  const store = { signedPreKey: (k: number) => (k === spk.keyId ? spk : undefined), takeOneTimePreKey: (k: number) => { const i = opks.findIndex((o) => o.keyId === k); return i >= 0 ? opks.splice(i, 1)[0] : undefined; } };
  const sessions = new Map<string, SessionRecord>();
  const inbox: { text: string; from: string; envelopeId: string; conversationId: string }[] = [];
  const socket: Socket = connect(`http://127.0.0.1:${PORT}/messenger`, { auth: { token: login.token, deviceId }, transports: ['websocket'] });
  const receipts: any[] = [];
  socket.on('envelope.new', (e: any) => {
    const key = `${e.senderUserId}:${e.senderDeviceId}`;
    const r = decryptMessage(id, sessions.get(key), e.type, e.ciphertext, store);
    sessions.set(key, r.session);
    inbox.push({ text: r.text, from: e.senderUserId, envelopeId: e.id, conversationId: e.conversationId });
  });
  socket.on('receipt', (r: any) => receipts.push(r));
  await new Promise<void>((res, rej) => { socket.on('connect', () => res()); socket.on('connect_error', rej); });
  return { name, phone, token: login.token, userId: login.userId, deviceId, id, sessions, inbox, socket, receipts };
}
type Client = Awaited<ReturnType<typeof phoneClient>>;

async function sendText(from: Client, toUserId: string, conversationId: string, text: string) {
  const bundles = (await api.req('GET', `/messenger/keys/${toUserId}`, { token: from.token })).body;
  const envelopes = bundles.map((b: any) => {
    const key = `${b.userId}:${b.deviceId}`;
    const s = from.sessions.get(key) ?? createOutgoingSession(from.id, b);
    const m = encryptMessage(s, text);
    from.sessions.set(key, s);
    return { recipientUserId: b.userId, recipientDeviceId: b.deviceId, type: m.type, ciphertext: m.body };
  });
  const messageId = `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const r = await api.req('POST', '/messenger/messages', { token: from.token, body: { conversationId, messageId, senderDeviceId: from.deviceId, envelopes } });
  expect(r.status).toBe(201);
  return messageId;
}
const waitFor = async (fn: () => boolean, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 25)); } };

describe('Aadhyay Messenger (E2EE, free for everyone — no institution needed)', () => {
  it('discover → chat → realtime delivery → decrypt → ack deletes from server → read receipts', async () => {
    const alice = await phoneClient('alice'), bob = await phoneClient('bob');
    const d = await api.req('POST', '/messenger/contacts/discover', { token: alice.token, body: { phones: [bob.phone, '+919000000001'] } });
    expect(d.body.matches.map((m: any) => m.userId)).toEqual([bob.userId]);
    const conv = await api.req('POST', '/messenger/conversations', { token: alice.token, body: { kind: 'direct', memberUserIds: [bob.userId] } });
    expect(conv.status).toBe(201);
    const same = await api.req('POST', '/messenger/conversations', { token: bob.token, body: { kind: 'direct', memberUserIds: [alice.userId] } });
    expect(same.body.id).toBe(conv.body.id); // direct chat is deduplicated
    const mid = await sendText(alice, bob.userId, conv.body.id, 'Namaste Bob! Kal PTM hai?');
    await waitFor(() => bob.inbox.length === 1);
    expect(bob.inbox[0]!.text).toBe('Namaste Bob! Kal PTM hai?');
    // Server never has plaintext
    const raw = await api.db.admin.execute(`select ciphertext from messenger_envelopes where message_id = '${mid}'` as any);
    expect(JSON.stringify(raw.rows)).not.toContain('PTM');
    // Ack via socket → deleted + delivered receipt to Alice
    await new Promise((res) => bob.socket.emit('envelope.ack', { envelopeIds: [bob.inbox[0]!.envelopeId] }, res));
    expect((await api.req('GET', `/messenger/envelopes?deviceId=${bob.deviceId}`, { token: bob.token })).body.length).toBe(0);
    await waitFor(() => alice.receipts.some((r) => r.kind === 'delivered'));
    bob.socket.emit('receipt', { conversationId: conv.body.id, messageIds: [mid], kind: 'seen' });
    await waitFor(() => alice.receipts.some((r) => r.kind === 'seen'));
    // Reply establishes the ratchet both ways
    await sendText(bob, alice.userId, conv.body.id, 'Haan, 10 baje.');
    await waitFor(() => alice.inbox.length === 1);
    expect(alice.inbox[0]!.text).toBe('Haan, 10 baje.');
    // Call setup: P2P with TURN credentials
    const call = await api.req('POST', '/messenger/calls', { token: alice.token, body: { conversationId: conv.body.id, kind: 'video' } });
    expect(call.body.mode).toBe('p2p');
    expect(call.body.ice.iceServers[1].username).toContain(alice.userId);
    alice.socket.close(); bob.socket.close();
  });

  it('message a number that is not on Aadhyay yet → becomes a real chat when they join', async () => {
    const alice = await phoneClient('alice2');
    const newPhone = uniquePhone();
    const conv = await api.req('POST', '/messenger/conversations', { token: alice.token, body: { kind: 'direct', memberPhones: [newPhone] } });
    expect(conv.body.members.find((m: any) => m.pending)).toBeTruthy();
    expect(conv.body.pendingInvites[0].phone).toBe(newPhone);
    const fulfilled: any[] = [];
    alice.socket.on('invite.fulfilled', (e: any) => fulfilled.push(e));
    const late = await api.login(newPhone, 'Late Joiner');
    await api.drain();
    await waitFor(() => fulfilled.length === 1);
    expect(fulfilled[0].userId).toBe(late.userId);
    const view = await api.req('GET', `/messenger/conversations/${conv.body.id}`, { token: alice.token });
    expect(view.body.members.some((m: any) => m.userId === late.userId && !m.pending)).toBe(true);
    alice.socket.close();
  });

  it('blocked users cannot fetch keys or deliver', async () => {
    const a = await phoneClient('a3'), b = await phoneClient('b3');
    const conv = await api.req('POST', '/messenger/conversations', { token: a.token, body: { kind: 'direct', memberUserIds: [b.userId] } });
    await api.req('POST', `/messenger/blocks/${a.userId}`, { token: b.token });
    expect((await api.req('GET', `/messenger/keys/${b.userId}`, { token: a.token })).status).toBe(403);
    const r = await api.req('POST', '/messenger/messages', { token: a.token, body: { conversationId: conv.body.id, messageId: 'x-12345678', senderDeviceId: a.deviceId, envelopes: [{ recipientUserId: b.userId, recipientDeviceId: b.deviceId, type: 2, ciphertext: 'AAAA' }] } });
    expect(r.body.dropped).toBe(1);
    a.socket.close(); b.socket.close();
  });
});
