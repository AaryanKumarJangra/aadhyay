import { z } from 'zod';

const b64 = z.string().regex(/^[A-Za-z0-9+/=_-]+$/);
export const registerDevice = z.object({
  deviceId: z.string().min(8).max(100),
  registrationId: z.number().int().nonnegative(),
  identityKey: b64, signingKey: b64,
  signedPreKey: z.object({ keyId: z.number().int(), publicKey: b64, signature: b64 }),
  preKeys: z.array(z.object({ keyId: z.number().int(), publicKey: b64 })).max(200),
});
export const uploadPrekeys = z.object({ deviceId: z.string(), preKeys: z.array(z.object({ keyId: z.number().int(), publicKey: b64 })).min(1).max(200) });
export const rotateSignedPrekey = z.object({ deviceId: z.string(), keyId: z.number().int(), publicKey: b64, signature: b64 });
/** Phones are sent over TLS, HMAC-hashed server-side and never stored raw (docs/02 §8.1). */
export const discoverContacts = z.object({ phones: z.array(z.string().min(6).max(20)).max(5000) });
export const createConversation = z.object({
  kind: z.enum(['direct', 'group', 'broadcast']),
  title: z.string().max(100).optional(),
  memberUserIds: z.array(z.string().uuid()).default([]),
  /** Phones not yet on Aadhyay: allowed. Messages wait in the sender outbox until they join. */
  memberPhones: z.array(z.string()).default([]),
});
export const sendEnvelopes = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().min(8).max(64),
  senderDeviceId: z.string(),
  envelopes: z.array(z.object({ recipientUserId: z.string().uuid(), recipientDeviceId: z.string(), type: z.number().int().min(1).max(4), ciphertext: b64 })).min(1).max(1000),
});
export const ackEnvelopes = z.object({ deviceId: z.string(), envelopeIds: z.array(z.string().uuid()).min(1).max(500) });
export const receiptInput = z.object({ conversationId: z.string().uuid(), messageIds: z.array(z.string()).min(1).max(500), kind: z.enum(['delivered', 'seen']) });
export const mediaUploadInit = z.object({ size: z.number().int().positive().max(2 * 1024 * 1024 * 1024), recipients: z.number().int().positive().max(1024) });
export const institutionChatInput = z.object({ studentId: z.string().uuid(), teacherStaffId: z.string().uuid().optional() });
export const reportInput = z.object({ reportedUserId: z.string().uuid(), conversationId: z.string().uuid().optional(), reason: z.string().min(3), evidence: z.array(z.object({ messageId: z.string(), text: z.string(), at: z.string() })).max(20).default([]) });
export const callStart = z.object({ conversationId: z.string().uuid(), kind: z.enum(['voice', 'video']) });
