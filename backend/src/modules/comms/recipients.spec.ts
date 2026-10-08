import { describe, it, expect } from 'vitest';
import { groupTrackingLinks, inQuietHours } from './recipients';

describe('bus tracking link grouping (multi-child rule)', () => {
  it('same guardian, same bus → one link with both children; different bus → separate link', () => {
    const g = groupTrackingLinks([
      { studentId: 's1', studentName: 'Aarav', guardianId: 'g1', vehicleId: 'v1', stopId: 'p1' },
      { studentId: 's2', studentName: 'Anaya', guardianId: 'g1', vehicleId: 'v1', stopId: 'p2' },
      { studentId: 's3', studentName: 'Kabir', guardianId: 'g1', vehicleId: 'v2', stopId: 'p3' },
      { studentId: 's1', studentName: 'Aarav', guardianId: 'g2', vehicleId: 'v1', stopId: 'p1' },
    ]);
    expect(g).toHaveLength(3);
    const g1v1 = g.find((x) => x.guardianId === 'g1' && x.vehicleId === 'v1')!;
    expect(g1v1.studentNames).toEqual(['Aarav', 'Anaya']);
    expect(g1v1.stopIds).toEqual(['p1', 'p2']);
    expect(g.find((x) => x.guardianId === 'g1' && x.vehicleId === 'v2')!.studentIds).toEqual(['s3']);
  });
  it('quiet hours wrap midnight', () => {
    expect(inQuietHours('22:15')).toBe(true);
    expect(inQuietHours('06:59')).toBe(true);
    expect(inQuietHours('07:00')).toBe(false);
    expect(inQuietHours('13:00')).toBe(false);
  });
});
