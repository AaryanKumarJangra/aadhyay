import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RealtimeBus } from './realtime-bus';

@Global()
@Module({ providers: [RedisService, RealtimeBus], exports: [RedisService, RealtimeBus] })
export class RedisModule {}
