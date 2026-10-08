import { Global, Module } from '@nestjs/common';
import { FeesController, FeesWebhookController, FeeHeadCrud, FeeDiscountCrud } from './fees.controller';
import { FeesService } from './fees.service';

@Global()
@Module({ controllers: [FeesController, FeesWebhookController, FeeHeadCrud, FeeDiscountCrud], providers: [FeesService], exports: [FeesService] })
export class FeesModule {}
