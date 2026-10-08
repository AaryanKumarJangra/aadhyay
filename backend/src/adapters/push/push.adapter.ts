import { Injectable, Logger } from '@nestjs/common';
import { SignJWT, importPKCS8 } from 'jose';
import { env } from '../../config/env';

export interface PushMessage { token: string; title: string; body: string; data?: Record<string, string>; silent?: boolean }

/** FCM HTTP v1 (Android, iOS via APNs bridge, Web). Free and unlimited. */
@Injectable()
export class PushAdapter {
  private readonly log = new Logger('Push');
  private accessToken: { value: string; exp: number } | null = null;
  private sa = env.FCM_SERVICE_ACCOUNT_JSON ? JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) : null;

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.exp > Date.now() + 60_000) return this.accessToken.value;
    const key = await importPKCS8(this.sa.private_key, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256' }).setIssuer(this.sa.client_email).setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const j = (await res.json()) as any;
    this.accessToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  /** Returns 'ok' | 'invalid_token' (caller deletes token) | 'error'. */
  async send(m: PushMessage): Promise<'ok' | 'invalid_token' | 'error'> {
    if (env.PUSH_PROVIDER !== 'fcm' || !this.sa) {
      this.log.log(`[push→${m.token.slice(0, 12)}…] ${m.title}: ${m.body}`);
      return 'ok';
    }
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: m.token,
          ...(m.silent ? {} : { notification: { title: m.title, body: m.body } }),
          data: m.data ?? {},
          android: { priority: 'high' },
          apns: { headers: { 'apns-priority': m.silent ? '5' : '10' }, payload: { aps: m.silent ? { 'content-available': 1 } : { sound: 'default' } } },
        },
      }),
    });
    if (res.ok) return 'ok';
    const body = await res.text();
    if (res.status === 404 || body.includes('UNREGISTERED')) return 'invalid_token';
    this.log.warn(`fcm ${res.status}: ${body}`);
    return 'error';
  }
}
