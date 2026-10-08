import { describe, it, expect } from 'vitest';
import { gradeAttempt, percentiles } from './grading';
describe('online test grading', () => {
  it('JEE style +4/-1 with multi and numeric', () => {
    const qs = [
      { id: 'a', type: 'mcq', answer: 'B', marks: 4, negative: 1 }, { id: 'b', type: 'mcq', answer: 'C', marks: 4, negative: 1 },
      { id: 'c', type: 'multi', answer: ['A', 'D'], marks: 4, negative: 2 }, { id: 'd', type: 'numeric', answer: { value: 9.8, tolerance: 0.05 }, marks: 4, negative: 0 },
      { id: 'e', type: 'mcq', answer: 'A', marks: 4, negative: 1 },
    ];
    const r = gradeAttempt(qs, { a: 'B', b: 'A', c: ['D', 'A'], d: '9.82' });
    expect(r).toMatchObject({ score: 11, correct: 3, wrong: 1, unattempted: 1 });
  });
  it('percentiles', () => expect(percentiles([100, 50, 50, 0])).toEqual([100, 50, 50, 0]));
});
