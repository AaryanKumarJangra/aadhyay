import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TokenService } from './auth/token.service';
import { LoginGuard } from './auth/login-guard.service';
import { AuthService } from './auth/auth.service';
import { AuthController, MeController } from './auth/auth.controller';
import { TenantService } from './tenancy/tenant.service';
import { AccessService } from './rbac/access.service';
import { EventsService } from './events/events.service';
import { AuditService } from './audit/audit.service';
import { FilesController } from './files/files.controller';
import { HealthController } from './health.controller';

const providers = [TokenService, LoginGuard, AuthService, TenantService, AccessService, EventsService, AuditService];

@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [AuthController, MeController, FilesController, HealthController],
  providers,
  exports: providers,
})
export class KernelModule {}
