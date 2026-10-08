import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { RedisModule } from './kernel/redis/redis.module';
import { AdaptersModule } from './adapters/adapters.module';
import { KernelModule } from './kernel/kernel.module';
import { AccessGuard } from './kernel/auth/access.guard';
import { AuditInterceptor } from './kernel/audit/audit.interceptor';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { FEATURE_MODULES } from './modules';

@Module({
  imports: [DbModule, RedisModule, AdaptersModule, KernelModule, ...FEATURE_MODULES],
  providers: [
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
