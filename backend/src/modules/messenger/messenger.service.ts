import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, lt, ne, sql, or } from 'drizzle-orm';
import { phoneIN, type DomainEvent } from '@aadhyay/contracts';
import { DbService } from '../../db/db.service';
import { messengerDevice, messengerPrekey, contactHash, conversation, conversationMember, messengerEnvelope, messageReceipt, pendingInvite, mediaBlob, userBlock, abuseReport, call, user, pushToken, student, studentGuardian, guardian, staff, section, enrollment, tenant, classSubject } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { RealtimeBus } from '../../kernel/redis/realtime-bus';
import { RedisService } from '../../kernel/redis/redis.service';
import { PushAdapter } from '../../adapters/push/push.adapter';
import { StorageAdapter } from '../../adapters/storage/storage.adapter';
import { OnEvent } from '../../kernel/events/events.service';
import { phoneHash } from '../../common/crypto';
import { AppError, badRequest, forbidden, notFound } from '../../common/errors';
import { uuidv7 } from '../../common/ids';
import { turnCredentials, livekitToken } from '../../adapters/turn/turn';
import { currentSession } from '../academics/session.util';

const MEDIA_TTL_MS = 30 * 86400_000;

/**
 * Aadhyay Messenger server (docs/02 §8). The server only routes ciphertext: it stores public keys,
 * encrypted envelopes until acked, and metadata needed for delivery. Free & unlimited for everyone.
 */
@Injectable()
export class MessengerService {
  constructor(private readonly db: DbService, private readonly rt: RealtimeBus, private readonly redis: RedisService, private readonly push: PushAdapter, private readonly storage: StorageAdapter) {}

  private me() {
    const u = Ctx.get().userId;
    if (!u) throw new AppError('UNAUTHENTICATED', 'Login required');
    return u;
  }

  // ---------------- Keys ----------------
  async registerDevice(b: { deviceId: string; registrationId: number; identityKey: string; signingKey: string; signedPreKey: { keyId: number; publicKey: string; signature: string }; preKeys: { keyId: number; publicKey: string }[] }) {
    const userId = this.me();
    const [d] = await this.db.admin.insert(messengerDevice).values({ userId, deviceId: b.deviceId, registrationId: b.registrationId, identityKey: b.identityKey, signingKey: b.signingKey, signedPreKeyId: b.signedPreKey.keyId, signedPreKey: b.signedPreKey.publicKey, signedPreKeySig: b.signedPreKey.signature })
      .onConflictDoUpdate({ target: [messengerDevice.userId, messengerDevice.deviceId], set: { registrationId: b.registrationId, identityKey: b.identityKey, signingKey: b.signingKey, signedPreKeyId: b.signedPreKey.keyId, signedPreKey: b.signedPreKey.publicKey, signedPreKeySig: b.signedPreKey.signature, revokedAt: null, lastSeenAt: new Date() } }).returning();
    await this.db.admin.delete(messengerPrekey).where(eq(messengerPrekey.deviceRef, d!.id));
    if (b.preKeys.length) await this.db.admin.insert(messengerPrekey).values(b.preKeys.map((p) => ({ deviceRef: d!.id, keyId: p.keyId, publicKey: p.publicKey }))).onConflictDoNothing();
    // Identity change → tell contacts so they can show "security code changed"
    await this.rt.publish('/messenger', `user:${userId}`, 'devices.changed', { userId });
    return { ok: true, deviceRef: d!.id };
  }
  async uploadPrekeys(deviceId: string, preKeys: { keyId: number; publicKey: string }[]) {
    const d = await this.myDevice(deviceId);
    await this.db.admin.insert(messengerPrekey).values(preKeys.map((p) => ({ deviceRef: d.id, keyId: p.keyId, publicKey: p.publicKey }))).onConflictDoNothing();
    return this.prekeyCount(deviceId);
  }
  async rotateSignedPrekey(deviceId: string, keyId: number, publicKey: string, signature: string) {
    const d = await this.myDevice(deviceId);
    await this.db.admin.update(messengerDevice).set({ signedPreKeyId: keyId, signedPreKey: publicKey, signedPreKeySig: signature }).where(eq(messengerDevice.id, d.id));
    return { ok: true };
  }
  async prekeyCount(deviceId: string) {
    const d = await this.myDevice(deviceId);
    const [r] = await this.db.admin.select({ n: sql<number>`count(*)::int` }).from(messengerPrekey).where(and(eq(messengerPrekey.deviceRef, d.id), isNull(messengerPrekey.usedAt)));
    return { remaining: r?.n ?? 0 };
  }
  private async myDevice(deviceId: string) {
    const [d] = await this.db.admin.select().from(messengerDevice).where(and(eq(messengerDevice.userId, this.me()), eq(messengerDevice.deviceId, deviceId), isNull(messengerDevice.revokedAt)));
    if (!d) throw notFound('Device');
    return d;
  }

  /** Prekey bundles for every active device of a user (each consumes one one-time prekey). */
  async bundles(userId: string) {
    const me = this.me();
    if (await this.isBlocked(userId, me)) throw forbidden('You cannot message this user');
    const devices = await this.db.admin.select().from(messengerDevice).where(and(eq(messengerDevice.userId, userId), isNull(messengerDevice.revokedAt)));
    const out = [];
    for (const d of devices) {
      const claimed = await this.db.admin.execute(sql`update messenger_prekeys set used_at = now() where id = (select id from messenger_prekeys where device_ref = ${d.id} and used_at is null order by key_id limit 1 for update skip locked) returning key_id, public_key`);
      const opk = claimed.rows[0] as any;
      out.push({ userId, deviceId: d.deviceId, registrationId: d.registrationId, identityKey: d.identityKey, signingKey: d.signingKey,
        signedPreKey: { keyId: d.signedPreKeyId, publicKey: d.signedPreKey, signature: d.signedPreKeySig },
        oneTimePreKey: opk ? { keyId: opk.key_id, publicKey: opk.public_key } : null });
      if (opk) {
        const [left] = await this.db.admin.select({ n: sql<number>`count(*)::int` }).from(messengerPrekey).where(and(eq(messengerPrekey.deviceRef, d.id), isNull(messengerPrekey.usedAt)));
        if ((left?.n ?? 0) < 10) await this.rt.publish('/messenger', `device:${userId}:${d.deviceId}`, 'prekeys.low', { remaining: left?.n ?? 0 });
      }
    }
    return out;
  }

  // ---------------- Contacts ----------------
  /** Phones in → hashed server-side → matches out. Only hashes are stored (for invite fulfilment). */
  async discover(phones: string[]) {
    const me = this.me();
    const normalised = [...new Set(phones.map((p) => phoneIN.safeParse(p)).filter((r) => r.success).map((r) => r.data as string))];
    const hashes = new Map(normalised.map((p) => [phoneHash(p), p]));
    if (!hashes.size) return { matches: [] };
    await this.db.admin.insert(contactHash).values([...hashes.keys()].map((h) => ({ ownerUserId: me, phoneHash: h }))).onConflictDoNothing();
    const users = await this.db.admin.select({ id: user.id, name: user.name, phoneHash: user.phoneHash, avatarFileId: user.avatarFileId }).from(user).where(and(inArray(user.phoneHash, [...hashes.keys()]), eq(user.isDisabled, false)));
    return { matches: users.filter((u) => u.id !== me).map((u) => ({ phone: hashes.get(u.phoneHash!)!, userId: u.id, name: u.name, avatarFileId: u.avatarFileId })) };
  }

  // ---------------- Conversations ----------------
  async createConversation(b: { kind: 'direct' | 'group' | 'broadcast'; title?: string; memberUserIds: string[]; memberPhones: string[] }, ctx: { tenantId?: string; context?: Record<string, unknown>; settings?: Record<string, unknown>; kind?: 'institution' } = {}) {
    const me = this.me();
    const phones = b.memberPhones.map((p) => phoneIN.safeParse(p)).filter((r) => r.success).map((r) => r.data as string);
    const phoneUsers = phones.length ? await this.db.admin.select({ id: user.id, phone: user.phone }).from(user).where(inArray(user.phone, phones)) : [];
    const userIds = [...new Set([...b.memberUserIds, ...phoneUsers.map((u) => u.id)])].filter((u) => u !== me);
    const pending = phones.filter((p) => !phoneUsers.some((u) => u.phone === p));
    if (b.kind === 'direct') {
      if (userIds.length + pending.length !== 1) throw badRequest('A direct chat has exactly one other person');
      if (userIds[0] && (await this.isBlocked(userIds[0], me))) throw forbidden('You cannot message this user');
      const existing = userIds[0] ? await this.findDirect(me, userIds[0]) : pending[0] ? await this.findPendingDirect(me, phoneHash(pending[0])) : null;
      if (existing && !ctx.kind) return this.conversationView(existing);
    }
    const id = uuidv7();
    await this.db.admin.transaction(async (tx) => {
      await tx.insert(conversation).values({ id, kind: ctx.kind ?? b.kind, title: b.title, createdBy: me, tenantId: ctx.tenantId ?? null, context: ctx.context ?? {}, settings: ctx.settings ?? {} });
      await tx.insert(conversationMember).values([
        { conversationId: id, userId: me, role: 'admin' },
        ...userIds.map((u) => ({ conversationId: id, userId: u, role: 'member' })),
        ...pending.map((p) => ({ conversationId: id, pendingPhoneHash: phoneHash(p), role: 'member' })),
      ]);
      for (const p of pending) await tx.insert(pendingInvite).values({ senderUserId: me, phoneHash: phoneHash(p), conversationId: id }).onConflictDoNothing();
    });
    for (const u of userIds) await this.rt.publish('/messenger', `user:${u}`, 'conversation.new', { conversationId: id });
    return { ...(await this.conversationView(id)), pendingInvites: pending.map((p) => ({ phone: p, inviteText: `Join me on Aadhyay — free, secure chat & calls: https://aadhyay.com/get?ref=${me.slice(0, 8)}` })) };
  }
  private async findDirect(a: string, b: string) {
    const r = await this.db.admin.execute(sql`select c.id from conversations c join conversation_members m1 on m1.conversation_id = c.id and m1.user_id = ${a} join conversation_members m2 on m2.conversation_id = c.id and m2.user_id = ${b} where c.kind = 'direct' limit 1`);
    return (r.rows[0] as any)?.id as string | undefined;
  }
  private async findPendingDirect(a: string, ph: string) {
    const r = await this.db.admin.execute(sql`select c.id from conversations c join conversation_members m1 on m1.conversation_id = c.id and m1.user_id = ${a} join conversation_members m2 on m2.conversation_id = c.id and m2.pending_phone_hash = ${ph} where c.kind = 'direct' limit 1`);
    return (r.rows[0] as any)?.id as string | undefined;
  }
  async conversationView(id: string) {
    const [c] = await this.db.admin.select().from(conversation).where(eq(conversation.id, id));
    if (!c) throw notFound('Conversation');
    const members = await this.db.admin.select({ userId: conversationMember.userId, pending: conversationMember.pendingPhoneHash, role: conversationMember.role, name: user.name, avatarFileId: user.avatarFileId, leftAt: conversationMember.leftAt })
      .from(conversationMember).leftJoin(user, eq(user.id, conversationMember.userId)).where(eq(conversationMember.conversationId, id));
    // Institution chats never expose phone numbers.
    return { ...c, members: members.filter((m) => !m.leftAt).map((m) => ({ userId: m.userId, name: m.name ?? 'Invited', pending: !!m.pending, role: m.role, avatarFileId: m.avatarFileId })) };
  }
  async myConversations() {
    const me = this.me();
    const ids = await this.db.admin.select({ id: conversationMember.conversationId }).from(conversationMember).where(and(eq(conversationMember.userId, me), isNull(conversationMember.leftAt)));
    if (!ids.length) return [];
    const convs = await this.db.admin.select().from(conversation).where(inArray(conversation.id, ids.map((i) => i.id))).orderBy(desc(conversation.updatedAt));
    return Promise.all(convs.map((c) => this.conversationView(c.id)));
  }
  private async assertMember(conversationId: string, userId = this.me()) {
    const [m] = await this.db.admin.select().from(conversationMember).where(and(eq(conversationMember.conversationId, conversationId), eq(conversationMember.userId, userId), isNull(conversationMember.leftAt)));
    if (!m) throw forbidden('Not a member of this conversation');
    return m;
  }
  async addMembers(conversationId: string, userIds: string[]) {
    const m = await this.assertMember(conversationId);
    if (m.role !== 'admin') throw forbidden('Only group admins can add members');
    await this.db.admin.insert(conversationMember).values(userIds.map((u) => ({ conversationId, userId: u }))).onConflictDoUpdate({ target: [conversationMember.conversationId, conversationMember.userId], set: { leftAt: null } });
    await this.rt.publish('/messenger', `conv:${conversationId}`, 'members.changed', { conversationId, rekey: false });
    for (const u of userIds) await this.rt.publish('/messenger', `user:${u}`, 'conversation.new', { conversationId });
    return this.conversationView(conversationId);
  }
  async leave(conversationId: string, userId = this.me()) {
    await this.db.admin.update(conversationMember).set({ leftAt: new Date() }).where(and(eq(conversationMember.conversationId, conversationId), eq(conversationMember.userId, userId)));
    // Remaining members must rotate their sender keys (forward secrecy for groups)
    await this.rt.publish('/messenger', `conv:${conversationId}`, 'members.changed', { conversationId, rekey: true, left: userId });
    return { ok: true };
  }

  // ---------------- Envelopes ----------------
  async send(b: { conversationId: string; messageId: string; senderDeviceId: string; envelopes: { recipientUserId: string; recipientDeviceId: string; type: number; ciphertext: string }[] }) {
    const me = this.me();
    await this.assertMember(b.conversationId, me);
    const [c] = await this.db.admin.select().from(conversation).where(eq(conversation.id, b.conversationId));
    await this.enforceInstitutionRules(c!, me);
    if (!(await this.redis.rateLimit(`msg:${me}`, 600, 60))) throw new AppError('RATE_LIMITED', 'You are sending messages too fast');
    const members = new Set((await this.db.admin.select({ u: conversationMember.userId }).from(conversationMember).where(and(eq(conversationMember.conversationId, b.conversationId), isNull(conversationMember.leftAt)))).map((m) => m.u));
    const blockedBy = new Set((await this.db.admin.select({ u: userBlock.userId }).from(userBlock).where(eq(userBlock.blockedUserId, me))).map((x) => x.u));
    const rows = b.envelopes.filter((e) => members.has(e.recipientUserId) && !blockedBy.has(e.recipientUserId)).map((e) => ({ id: uuidv7(), conversationId: b.conversationId, messageId: b.messageId, senderUserId: me, senderDeviceId: b.senderDeviceId, recipientUserId: e.recipientUserId, recipientDeviceId: e.recipientDeviceId, type: e.type, ciphertext: e.ciphertext }));
    if (rows.length) await this.db.admin.insert(messengerEnvelope).values(rows);
    await this.db.admin.update(conversation).set({ updatedAt: new Date() }).where(eq(conversation.id, b.conversationId));
    const recipients = [...new Set(rows.map((r) => r.recipientUserId))].filter((u) => u !== me);
    if (recipients.length) await this.db.admin.insert(messageReceipt).values(recipients.map((u) => ({ messageId: b.messageId, conversationId: b.conversationId, senderUserId: me, userId: u }))).onConflictDoNothing();
    for (const r of rows) {
      await this.rt.publish('/messenger', `device:${r.recipientUserId}:${r.recipientDeviceId}`, 'envelope.new', { id: r.id, conversationId: r.conversationId, messageId: r.messageId, senderUserId: me, senderDeviceId: r.senderDeviceId, type: r.type, ciphertext: r.ciphertext, sentAt: new Date().toISOString() });
    }
    // Wake offline devices with a content-free data push.
    const online = new Set<string>();
    for (const u of recipients) if (await this.redis.client.exists(`online:${u}`)) online.add(u);
    const offline = recipients.filter((u) => !online.has(u));
    if (offline.length) {
      const tokens = await this.db.admin.select().from(pushToken).where(inArray(pushToken.userId, offline));
      for (const t of tokens) await this.push.send({ token: t.token, title: 'Aadhyay', body: 'New message', data: { type: 'messenger', conversationId: b.conversationId }, silent: false });
    }
    return { accepted: rows.length, dropped: b.envelopes.length - rows.length };
  }
  async pending(deviceId: string, cursor?: string) {
    const me = this.me();
    await this.db.admin.update(messengerDevice).set({ lastSeenAt: new Date() }).where(and(eq(messengerDevice.userId, me), eq(messengerDevice.deviceId, deviceId)));
    return this.db.admin.select().from(messengerEnvelope).where(and(eq(messengerEnvelope.recipientUserId, me), eq(messengerEnvelope.recipientDeviceId, deviceId), cursor ? sql`${messengerEnvelope.id} > ${cursor}` : undefined)).orderBy(asc(messengerEnvelope.id)).limit(500);
  }
  /** Device confirms decryption → envelope deleted from server (it never keeps message history). */
  async ack(deviceId: string, ids: string[]) {
    const me = this.me();
    const del = await this.db.admin.delete(messengerEnvelope).where(and(inArray(messengerEnvelope.id, ids), eq(messengerEnvelope.recipientUserId, me), eq(messengerEnvelope.recipientDeviceId, deviceId))).returning({ messageId: messengerEnvelope.messageId, conversationId: messengerEnvelope.conversationId, sender: messengerEnvelope.senderUserId });
    for (const d of del) await this.receipt(d.conversationId, [d.messageId], 'delivered', d.sender);
    return { deleted: del.length };
  }
  async receipt(conversationId: string, messageIds: string[], kind: 'delivered' | 'seen', knownSender?: string) {
    const me = this.me();
    const now = new Date();
    const rows = await this.db.admin.update(messageReceipt).set(kind === 'seen' ? { seenAt: now, deliveredAt: sql`coalesce(${messageReceipt.deliveredAt}, now())` } : { deliveredAt: sql`coalesce(${messageReceipt.deliveredAt}, now())` })
      .where(and(inArray(messageReceipt.messageId, messageIds), eq(messageReceipt.userId, me))).returning();
    const senders = new Set(rows.map((r) => r.senderUserId).concat(knownSender ? [knownSender] : []));
    for (const s of senders) await this.rt.publish('/messenger', `user:${s}`, 'receipt', { conversationId, messageIds, kind, by: me, at: now.toISOString() });
    return { ok: true };
  }
  async receiptsFor(messageId: string) {
    const me = this.me();
    return this.db.admin.select({ userId: messageReceipt.userId, deliveredAt: messageReceipt.deliveredAt, seenAt: messageReceipt.seenAt }).from(messageReceipt).where(and(eq(messageReceipt.messageId, messageId), eq(messageReceipt.senderUserId, me)));
  }

  /** When someone joins Aadhyay, their pending chats become real and inviters are told to encrypt+send. */
  @OnEvent('user.registered')
  async onUserRegistered(e: DomainEvent<{ userId: string; phoneHash: string }>) {
    const { userId, phoneHash: ph } = e.data;
    const members = await this.db.admin.update(conversationMember).set({ userId, pendingPhoneHash: null }).where(eq(conversationMember.pendingPhoneHash, ph)).returning();
    const invites = await this.db.admin.update(pendingInvite).set({ fulfilledAt: new Date() }).where(and(eq(pendingInvite.phoneHash, ph), isNull(pendingInvite.fulfilledAt))).returning();
    for (const i of invites) await this.rt.publish('/messenger', `user:${i.senderUserId}`, 'invite.fulfilled', { userId, conversationId: i.conversationId });
    return { members: members.length, invites: invites.length };
  }

  // ---------------- Media ----------------
  async mediaUpload(size: number, recipients: number) {
    const me = this.me();
    const id = uuidv7();
    const key = `messenger/${id}`;
    await this.db.admin.insert(mediaBlob).values({ id, key, size, uploadedBy: me, pendingDownloads: recipients, expiresAt: new Date(Date.now() + MEDIA_TTL_MS) });
    return { mediaId: id, uploadUrl: await this.storage.uploadUrl(key, 'application/octet-stream'), expiresAt: new Date(Date.now() + MEDIA_TTL_MS) };
  }
  async mediaDownload(id: string) {
    const [m] = await this.db.admin.select().from(mediaBlob).where(eq(mediaBlob.id, id));
    if (!m || m.expiresAt < new Date()) throw notFound('Media expired');
    return { url: await this.storage.downloadUrl(m.key, 900) };
  }
  /** Called after a device downloaded & decrypted; blob deleted when all recipients have it (docs/01 §10.3). */
  async mediaDownloaded(id: string) {
    const [m] = await this.db.admin.update(mediaBlob).set({ pendingDownloads: sql`greatest(${mediaBlob.pendingDownloads} - 1, 0)` }).where(eq(mediaBlob.id, id)).returning();
    if (m && m.pendingDownloads <= 0) {
      await this.storage.delete(m.key).catch(() => undefined);
      await this.db.admin.delete(mediaBlob).where(eq(mediaBlob.id, id));
    }
    return { ok: true };
  }
  async cleanupMedia() {
    const expired = await this.db.admin.select().from(mediaBlob).where(lt(mediaBlob.expiresAt, new Date())).limit(1000);
    for (const m of expired) await this.storage.delete(m.key).catch(() => undefined);
    if (expired.length) await this.db.admin.delete(mediaBlob).where(inArray(mediaBlob.id, expired.map((m) => m.id)));
    const stale = await this.db.admin.delete(messengerEnvelope).where(lt(messengerEnvelope.sentAt, new Date(Date.now() - MEDIA_TTL_MS))).returning({ id: messengerEnvelope.id });
    return { media: expired.length, envelopes: stale.length };
  }

  // ---------------- Safety ----------------
  async isBlocked(target: string, by: string) {
    const [b] = await this.db.admin.select().from(userBlock).where(or(and(eq(userBlock.userId, target), eq(userBlock.blockedUserId, by)), and(eq(userBlock.userId, by), eq(userBlock.blockedUserId, target)))).limit(1);
    return !!b;
  }
  async block(userId: string, blocked: boolean) {
    const me = this.me();
    if (blocked) await this.db.admin.insert(userBlock).values({ userId: me, blockedUserId: userId }).onConflictDoNothing();
    else await this.db.admin.delete(userBlock).where(and(eq(userBlock.userId, me), eq(userBlock.blockedUserId, userId)));
    return { ok: true };
  }
  async report(b: { reportedUserId: string; conversationId?: string; reason: string; evidence: unknown[] }) {
    const me = this.me();
    const [c] = b.conversationId ? await this.db.admin.select().from(conversation).where(eq(conversation.id, b.conversationId)) : [undefined];
    const [r] = await this.db.admin.insert(abuseReport).values({ reporterUserId: me, reportedUserId: b.reportedUserId, conversationId: b.conversationId, tenantId: c?.tenantId ?? null, reason: b.reason, evidence: b.evidence }).returning();
    return { id: r!.id, routedTo: c?.tenantId ? 'institution' : 'aadhyay_trust_safety' };
  }

  // ---------------- Calls ----------------
  async startCall(conversationId: string, kind: 'voice' | 'video') {
    const me = this.me();
    await this.assertMember(conversationId, me);
    const members = await this.db.admin.select({ u: conversationMember.userId }).from(conversationMember).where(and(eq(conversationMember.conversationId, conversationId), isNull(conversationMember.leftAt)));
    const others = members.map((m) => m.u).filter((u): u is string => !!u && u !== me);
    const isGroup = others.length > 1;
    const room = isGroup ? `call-${uuidv7()}` : null;
    const [c] = await this.db.admin.insert(call).values({ conversationId, kind, startedBy: me, sfuRoom: room }).returning();
    for (const u of others) await this.rt.publish('/calls', `user:${u}`, 'call.ring', { callId: c!.id, conversationId, kind, from: me, sfu: !!room });
    return { callId: c!.id, mode: isGroup ? 'sfu' : 'p2p', ice: turnCredentials(me), ...(room ? { livekit: await livekitToken(room, me, me) } : {}) };
  }
  async joinCall(callId: string) {
    const me = this.me();
    const [c] = await this.db.admin.select().from(call).where(eq(call.id, callId));
    if (!c) throw notFound('Call');
    await this.assertMember(c.conversationId, me);
    if (!c.answeredAt) await this.db.admin.update(call).set({ answeredAt: new Date() }).where(eq(call.id, callId));
    return { callId, mode: c.sfuRoom ? 'sfu' : 'p2p', ice: turnCredentials(me), ...(c.sfuRoom ? { livekit: await livekitToken(c.sfuRoom, me, me) } : {}) };
  }
  async endCall(callId: string) {
    const [c] = await this.db.admin.update(call).set({ endedAt: new Date() }).where(eq(call.id, callId)).returning();
    if (c) await this.rt.publish('/calls', `conv:${c.conversationId}`, 'call.end', { callId });
    return { ok: true };
  }

  // ---------------- Institution chats (docs/03 §5) ----------------
  /** Parent ↔ teacher chat about a child. Teacher's phone stays hidden; institution rules apply. */
  async parentTeacherChat(studentId: string, teacherStaffId?: string) {
    const me = this.me();
    const tenantId = Ctx.tenantId();
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const [enr] = await tx.select().from(enrollment).where(and(eq(enrollment.studentId, studentId), eq(enrollment.sessionId, sess.id)));
      if (!enr) throw notFound('Student enrolment');
      const [sec] = await tx.select().from(section).where(eq(section.id, enr.sectionId));
      const tId = teacherStaffId ?? sec?.classTeacherId;
      if (!tId) throw badRequest('No class teacher assigned');
      if (teacherStaffId && teacherStaffId !== sec?.classTeacherId) {
        const [cs] = await tx.select().from(classSubject).where(and(eq(classSubject.teacherId, teacherStaffId), eq(classSubject.classId, enr.classId))).limit(1);
        if (!cs) throw forbidden('This teacher does not teach the child');
      }
      const [t] = await tx.select().from(staff).where(eq(staff.id, tId));
      if (!t?.userId) throw badRequest('Teacher has no login yet');
      const guardians = await tx.select({ userId: guardian.userId }).from(studentGuardian).innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId)).where(eq(studentGuardian.studentId, studentId));
      const isGuardian = guardians.some((g) => g.userId === me);
      if (!isGuardian && t.userId !== me) throw forbidden('Only the child’s guardians or teacher can open this chat');
      const existing = await this.db.admin.execute(sql`select c.id from conversations c join conversation_members m on m.conversation_id = c.id and m.user_id = ${me}
        where c.kind = 'institution' and c.tenant_id = ${tenantId} and c.context->>'studentId' = ${studentId} and c.context->>'teacherStaffId' = ${tId} limit 1`);
      if ((existing.rows[0] as any)?.id) return this.conversationView((existing.rows[0] as any).id);
      const [stu] = await tx.select({ name: student.name }).from(student).where(eq(student.id, studentId));
      const [ten] = await this.db.admin.select({ settings: tenant.settings }).from(tenant).where(eq(tenant.id, tenantId));
      const hours = (ten?.settings as any)?.parentChatHours ?? { start: '07:00', end: '20:00' };
      const others = [...new Set([t.userId, ...guardians.map((g) => g.userId).filter(Boolean) as string[]])].filter((u) => u !== me);
      const conv = await this.createConversation({ kind: 'group', title: `${stu?.name} — ${t.name}`, memberUserIds: others, memberPhones: [] },
        { kind: 'institution', tenantId, context: { studentId, teacherStaffId: tId, studentName: stu?.name }, settings: { allowedHours: hours, parentInitiatedLimited: true } });
      // Teacher administers the chat; guardians are members (hours rule applies to them).
      await this.db.admin.update(conversationMember).set({ role: 'member' }).where(eq(conversationMember.conversationId, conv.id));
      await this.db.admin.update(conversationMember).set({ role: 'admin' }).where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, t.userId)));
      return this.conversationView(conv.id);
    });
  }
  /** Class group (broadcast-only by default): class teacher + subject teachers + all guardians. */
  async classGroup(sectionId: string, broadcastOnly = true) {
    const tenantId = Ctx.tenantId();
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const [sec] = await tx.select().from(section).where(eq(section.id, sectionId));
      if (!sec) throw notFound('Section');
      const kids = await tx.select({ id: enrollment.studentId }).from(enrollment).where(and(eq(enrollment.sectionId, sectionId), eq(enrollment.sessionId, sess.id)));
      const gs = kids.length ? await tx.selectDistinct({ userId: guardian.userId }).from(studentGuardian).innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId)).where(inArray(studentGuardian.studentId, kids.map((k) => k.id))) : [];
      const teachers = await tx.selectDistinct({ userId: staff.userId }).from(staff).where(or(eq(staff.id, sec.classTeacherId ?? '00000000-0000-0000-0000-000000000000'), sql`${staff.id} in (select teacher_id from class_subjects where class_id = ${sec.classId})`));
      const conv = await this.createConversation({ kind: 'group', title: `Class group`, memberUserIds: [...gs, ...teachers].map((x) => x.userId).filter(Boolean) as string[], memberPhones: [] },
        { kind: 'institution', tenantId, context: { sectionId }, settings: { broadcastOnly } });
      const tIds = teachers.map((t) => t.userId).filter(Boolean) as string[];
      if (tIds.length) await this.db.admin.update(conversationMember).set({ role: 'admin' }).where(and(eq(conversationMember.conversationId, conv.id), inArray(conversationMember.userId, tIds)));
      return this.conversationView(conv.id);
    });
  }
  private async enforceInstitutionRules(c: typeof conversation.$inferSelect, sender: string) {
    if (c.kind !== 'institution') return;
    const s = (c.settings ?? {}) as any;
    const [m] = await this.db.admin.select().from(conversationMember).where(and(eq(conversationMember.conversationId, c.id), eq(conversationMember.userId, sender)));
    if (s.broadcastOnly && m?.role !== 'admin') throw forbidden('Only teachers can post in this class group');
    if (s.allowedHours && m?.role !== 'admin') {
      const [t] = await this.db.admin.select({ tz: tenant.timezone }).from(tenant).where(eq(tenant.id, c.tenantId!));
      const now = new Intl.DateTimeFormat('en-GB', { timeZone: t?.tz ?? 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
      if (now < s.allowedHours.start || now >= s.allowedHours.end) throw forbidden(`Messaging hours for teachers are ${s.allowedHours.start}–${s.allowedHours.end}`);
    }
  }
}
