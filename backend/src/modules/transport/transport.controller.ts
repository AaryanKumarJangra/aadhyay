import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Transport } from '@aadhyay/contracts';
import { Can, RequireModule, Public, Scoped } from '../../kernel/auth/decorators';
import { Authz } from '../../kernel/authz/authz';
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
  @Can('transport.trip.view', 'transport.route.view') @Scoped() @Get('vehicles/:id/riders')
  async riders(@Param('id') id: string, @Query('direction') d: 'pickup' | 'drop' = 'pickup') {
    // Drivers see riders only for their own vehicle; transport staff for any.
    if (Authz.filter('transport.trip.view').kind !== 'all' && Authz.filter('transport.route.view').kind !== 'all') await this.svc.assertDriver(id);
    return this.svc.riders(id, d);
  }
  // Driver app
  @Can('transport.trip.create', 'transport.trip.manage') @Scoped() @Post('trips/start')
  start(@Body(Z(Transport.startTrip)) b: any) {
    return this.svc.startTrip(b);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Scoped() @Post('trips/ping')
  ping(@Body(Z(Transport.tripPing)) b: any) {
    return this.svc.ping(b.tripId, b.points);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Scoped() @Post('trips/student-event')
  studentEvent(@Body(Z(Transport.tripStudentEvent)) b: any) {
    return this.svc.studentEvent(b);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Scoped() @Post('trips/sos')
  sos(@Body(Z(Transport.sosInput)) b: any) {
    return this.svc.sos(b);
  }
  @Can('transport.trip.create', 'transport.trip.manage') @Scoped() @Post('trips/:id/end')
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
  /** Driver app trip setup: only the vehicles this driver/attendant is assigned to and those vehicles' routes. */
  @Can('transport.trip.create', 'transport.trip.manage') @Scoped() @Get('my/vehicles')
  myVehicles() {
    return this.svc.driverSetup();
  }
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
