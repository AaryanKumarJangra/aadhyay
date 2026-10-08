import { Global, Module } from '@nestjs/common';
import { MessengerController, InstitutionChatController } from './messenger.controller';
import { MessengerService } from './messenger.service';

@Global()
@Module({ controllers: [MessengerController, InstitutionChatController], providers: [MessengerService], exports: [MessengerService] })
export class MessengerModule {}
