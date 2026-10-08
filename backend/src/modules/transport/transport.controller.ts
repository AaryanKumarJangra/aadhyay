import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Transport } from '@aadhyay/contracts';
import { Can, RequireModule, Public } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { TransportService } from './transport.service';
import { crudController } from '../../common/crud';
import { vehicle, stop } from '../../db/schema';

@RequireModule('transport')
@Controller('transport')
export class TransportController {
  constructor(private readonly svc: TransportService) {}

  @Can('transport.route.view') @Get('routes')
  routes() {
    return this.svc.routes();
  }
  @Can('transport.route.create') @Post('routes')
  createRoute(@Body(Z(Transport.routeInput)) b: any) {
    return this.svc.createRoute(b);
  }
  @Can('transport.assignment.create', 'transport.route.edit') @Post('assign')
  assign(@Body(Z(Transport.assignTransport)) b: any) {
    return this.svc.assign(b);
  }
  @Can('transport.trip.view', 'transport.route.view') @Get('vehicles/:id/riders')
  riders(@Param('id') id: string, @Query('direction') d: 'pickup' | 'drop' = 'pickup') {
    return this.svc.riders(id, d);
  }
  // Driver app
  @Can('transport.trip.create', 'transport.trip.manage') @Post('trips/start')
  start(@Body(Z(Transport.startTrip)) b: any) {
    return this.svc.startTrip(b);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Post('trips/ping')
  ping(@Body(Z(Transport.tripPing)) b: any) {
    return this.svc.ping(b.tripId, b.points);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Post('trips/student-event')
  studentEvent(@Body(Z(Transport.tripStudentEvent)) b: any) {
    return this.svc.studentEvent(b);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Post('trips/sos')
  sos(@Body(Z(Transport.sosInput)) b: any) {
    return this.svc.sos(b);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Post('trips/:id/end')
  end(@Param('id') id: string) {
    return this.svc.endTrip(id);
  }
  @Can('transport.trip.view') @Get('trips/live')
  live() {
    return this.svc.liveTrips();
  }
  @Can('transport.trip.view') @Get('trips/:id/report')
  report(@Param('id') id: string) {
    return this.svc.tripReport(id);
  }
  /** Parent app live map. */
  @Get('my/buses')
  myBuses() {
    return this.svc.myBuses();
  }
}

@Controller('public/track')
export class PublicTrackController {
  constructor(private readonly svc: TransportService) {}
  @Public() @Get(':token')
  track(@Param('token') token: string) {
    return this.svc.publicTrack(token);
  }
}

export const VehicleCrud = crudController({ path: 'transport/vehicles', module: 'transport', perm: 'transport.vehicle', table: vehicle as any, create: Transport.vehicleInput, search: [vehicle.regNo, vehicle.name] });
export const StopCrud = crudController({ path: 'transport/stops', module: 'transport', perm: 'transport.route', table: stop as any, create: z.object({ routeId: z.string().uuid(), name: z.string(), lat: z.number(), lng: z.number(), order: z.number().int(), pickupTime: z.string().optional(), dropTime: z.string().optional(), feePaise: z.number().int().default(0) }), filters: { routeId: stop.routeId }, sort: { column: stop.order, dir: 'asc' } });
