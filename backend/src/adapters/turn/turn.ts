import { createHmac } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { env } from '../../config/env';

/** coturn "TURN REST API" ephemeral credentials (use-auth-secret). Valid for ttlSec. */
export function turnCredentials(userId: string, ttlSec = 6 * 3600) {
  const username = `${Math.floor(Date.now() / 1000) + ttlSec}:${userId}`;
  const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
  return {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: env.TURN_URLS.split(','), username, credential },
    ],
    ttlSec,
  };
}

/** LiveKit SFU token for group calls / live classes. */
export async function livekitToken(room: string, identity: string, name: string, canPublish = true) {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity, name, ttl: '6h' });
  at.addGrant({ room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: true });
  return { url: env.LIVEKIT_URL, token: await at.toJwt() };
}
