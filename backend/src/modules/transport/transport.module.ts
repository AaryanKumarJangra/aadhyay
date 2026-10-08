import { Module } from '@nestjs/common';
import { TransportController, PublicTrackController, VehicleCrud, StopCrud } from './transport.controller';
import { TransportService } from './transport.service';

@Module({ controllers: [TransportController, PublicTrackController, VehicleCrud, StopCrud], providers: [TransportService], exports: [TransportService] })
export class TransportModule {}
