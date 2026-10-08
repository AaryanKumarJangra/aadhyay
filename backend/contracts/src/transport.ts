import { z } from 'zod';

export const vehicleInput = z.object({
  regNo: z.string().min(4), name: z.string().optional(), capacity: z.number().int().positive(),
  gpsDeviceId: z.string().optional(), driverStaffId: z.string().uuid().optional(), attendantStaffId: z.string().uuid().optional(),
});
export const routeInput = z.object({
  name: z.string().min(1), vehicleId: z.string().uuid().optional(),
  stops: z.array(z.object({
    name: z.string(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), order: z.number().int(),
    pickupTime: z.string().optional(), dropTime: z.string().optional(), feePaise: z.number().int().nonnegative().default(0),
  })).default([]),
});
export const assignTransport = z.object({
  studentId: z.string().uuid(),
  direction: z.enum(['pickup', 'drop']),
  routeId: z.string().uuid(), stopId: z.string().uuid(), vehicleId: z.string().uuid(),
});
export const startTrip = z.object({ vehicleId: z.string().uuid(), routeId: z.string().uuid(), direction: z.enum(['pickup', 'drop']) });
export const tripPing = z.object({
  tripId: z.string().uuid(),
  points: z.array(z.object({ lat: z.number(), lng: z.number(), speed: z.number().optional(), heading: z.number().optional(), at: z.string().datetime() })).min(1).max(200),
});
export const tripStudentEvent = z.object({ tripId: z.string().uuid(), studentId: z.string().uuid(), kind: z.enum(['boarded', 'dropped']), stopId: z.string().uuid().optional() });
export const sosInput = z.object({ tripId: z.string().uuid(), lat: z.number().optional(), lng: z.number().optional(), note: z.string().optional() });
