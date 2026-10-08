import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  /** Keys are namespaced (REDIS_NAMESPACE) so separate stacks can share one Redis safely. */
  static readonly prefix = `${env.REDIS_NAMESPACE}:`;
  readonly client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false, keyPrefix: RedisService.prefix });

  async getJson<T>(key: string): Promise<T | null> {
    const v = await this.client.get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async setJson(key: string, value: unknown, ttlSec: number) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSec);
  }
  /** Fixed-window rate limit. Returns true if allowed. */
  async rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = await this.client.incr(k);
    if (n === 1) await this.client.expire(k, windowSec);
    return n <= limit;
  }
  async onModuleDestroy() {
    this.client.disconnect();
  }
}
