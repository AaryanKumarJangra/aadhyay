import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';
import { env } from '../../config/env';

/** API/worker → realtime process fan-out (Redis pub/sub). Realtime emits to Socket.IO rooms. */
@Injectable()
export class RealtimeBus {
  /** Pub/sub channels are not affected by ioredis keyPrefix, so the namespace is applied here explicitly. */
  static CHANNEL = `${env.REDIS_NAMESPACE}:rt`;
  constructor(private readonly redis: RedisService) {}
  publish(namespace: string, room: string, event: string, payload: unknown) {
    return this.redis.client.publish(RealtimeBus.CHANNEL, JSON.stringify({ ns: namespace, room, event, payload }));
  }
}
