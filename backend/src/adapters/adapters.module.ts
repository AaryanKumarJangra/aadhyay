import { Global, Module } from '@nestjs/common';
import { EmailAdapter } from './email/email.adapter';
import { SmsAdapter } from './sms/sms.adapter';
import { PushAdapter } from './push/push.adapter';
import { WhatsAppAdapter } from './whatsapp/whatsapp.adapter';
import { PaymentsAdapter } from './payments/payments.adapter';
import { StorageAdapter } from './storage/storage.adapter';

const adapters = [EmailAdapter, SmsAdapter, PushAdapter, WhatsAppAdapter, PaymentsAdapter, StorageAdapter];
@Global()
@Module({ providers: adapters, exports: adapters })
export class AdaptersModule {}
