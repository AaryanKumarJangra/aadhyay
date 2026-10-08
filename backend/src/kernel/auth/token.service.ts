import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env';

const key = new TextEncoder().encode(env.JWT_SECRET);
export const ACCESS_TTL_SEC = 15 * 60;

export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id
  tid?: string; // active tenant id
  typ: 'access' | 'platform' | 'track';
  role?: string; // platform role
}

@Injectable()
export class TokenService {
  async sign(claims: AccessClaims, ttlSec = ACCESS_TTL_SEC): Promise<string> {
    return new SignJWT({ ...claims }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${ttlSec}s`).setIssuer('aadhyay').sign(key);
  }
  async verify<T = AccessClaims>(token: string): Promise<T> {
    const { payload } = await jwtVerify(token, key, { issuer: 'aadhyay' });
    return payload as unknown as T;
  }
  /** Generic signed token (tracking links, invites, exports). */
  async signAny(payload: Record<string, unknown>, ttlSec: number) {
    return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${ttlSec}s`).setIssuer('aadhyay').sign(key);
  }
}
