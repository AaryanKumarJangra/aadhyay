import { Global, Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { BillingService } from './billing.service';
import { LifecycleService } from './lifecycle.service';
import { FinanceService } from './finance.service';
import { PublicController } from './public.controller';
import { BillingController, PlatformPaymentWebhook } from './billing.controller';
import { ControlController } from './control.controller';
import { PlatformController, PlatformAudit } from './platform.controller';

@Global()
@Module({
  controllers: [PublicController, BillingController, PlatformPaymentWebhook, ControlController, PlatformController],
  providers: [ProvisioningService, BillingService, LifecycleService, FinanceService, PlatformAudit],
  exports: [ProvisioningService, BillingService, LifecycleService, FinanceService, PlatformAudit],
})
export class ControlPlaneModule {}
