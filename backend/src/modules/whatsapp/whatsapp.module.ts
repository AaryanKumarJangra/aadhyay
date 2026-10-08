import { Global, Module } from '@nestjs/common';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';

@Global()
@Module({ imports: [ControlPlaneModule], controllers: [WhatsAppController, WhatsAppWebhookController], providers: [WhatsAppService], exports: [WhatsAppService] })
export class WhatsAppModule {}
