import { describe, it, expect } from 'vitest';
import { gradeFor, rank, sgpa } from './grading';
const cbse = [{ grade: 'A1', min: 91, max: 100 }, { grade: 'A2', min: 81, max: 90.99 }, { grade: 'B1', min: 71, max: 80.99 }, { grade: 'E', min: 0, max: 32.99 }];
describe('grading', () => {
  it('grades', () => {
    expect(gradeFor(95, cbse)?.grade).toBe('A1');
    expect(gradeFor(90.995, cbse)?.grade).toBe('A2');
    expect(gradeFor(10, cbse)?.grade).toBe('E');
  });
  it('competition rank', () => {
    expect(rank([{ id: 'a', percentage: 90 }, { id: 'b', percentage: 95 }, { id: 'c', percentage: 90 }, { id: 'd', percentage: 80 }]).map((r) => [r.id, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
  });
  it('sgpa', () => expect(sgpa([{ credits: 4, gradePoint: 9 }, { credits: 3, gradePoint: 8 }])).toBe(8.57));
});
