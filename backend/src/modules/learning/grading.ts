/** Auto-grading for objective questions with negative marking (JEE/NEET-style). */
export interface Q { id: string; type: string; answer: any; marks: number; negative: number }
export function gradeAttempt(questions: Q[], answers: Record<string, unknown>) {
  let score = 0, correct = 0, wrong = 0, unattempted = 0;
  const detail: Record<string, { correct: boolean | null; marks: number }> = {};
  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined || a === null || a === '' || (Array.isArray(a) && !a.length)) { unattempted++; detail[q.id] = { correct: null, marks: 0 }; continue; }
    let ok: boolean | null = null;
    switch (q.type) {
      case 'mcq': case 'truefalse': case 'assertion': ok = String(a) === String(q.answer); break;
      case 'multi': { const exp = [...(q.answer as string[])].sort().join('|'), got = [...(a as string[])].sort().join('|'); ok = exp === got; break; }
      case 'numeric': { const tol = (q.answer as any).tolerance ?? 0; ok = Math.abs(Number(a) - Number((q.answer as any).value ?? q.answer)) <= tol; break; }
      case 'matrix': ok = JSON.stringify(a) === JSON.stringify(q.answer); break;
      default: ok = null; // subjective → manual
    }
    const m = ok === true ? q.marks : ok === false ? -q.negative : 0;
    if (ok === true) correct++;
    if (ok === false) wrong++;
    score += m;
    detail[q.id] = { correct: ok, marks: m };
  }
  return { score: Math.round(score * 100) / 100, correct, wrong, unattempted, detail };
}
/** Percentile = % of candidates scoring strictly below + half of ties (standard NTA-style approximation). */
export function percentiles(scores: number[]) {
  const n = scores.length;
  return scores.map((s) => (n <= 1 ? 100 : Math.round(((scores.filter((x) => x < s).length + (scores.filter((x) => x === s).length - 1) / 2) / (n - 1)) * 10000) / 100));
}
