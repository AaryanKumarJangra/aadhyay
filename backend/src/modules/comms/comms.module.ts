import { Global, Module } from '@nestjs/common';
import { CommsController, PushController } from './comms.controller';
import { CommsService } from './comms.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';

@Global()
@Module({ imports: [ControlPlaneModule], controllers: [CommsController, PushController], providers: [CommsService], exports: [CommsService] })
export class CommsModule {}
