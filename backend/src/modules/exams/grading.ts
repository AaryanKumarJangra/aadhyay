export interface Band { grade: string; min: number; max: number; point?: number; remark?: string }

export function gradeFor(pct: number, bands: Band[]): Band | undefined {
  return bands.find((b) => pct >= b.min && pct <= b.max) ?? bands.sort((a, b) => b.min - a.min).find((b) => pct >= b.min);
}

/** Standard competition ranking (1,2,2,4) by percentage desc. */
export function rank<T extends { percentage: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  let lastPct = -1, lastRank = 0;
  return sorted.map((r, i) => {
    const rk = r.percentage === lastPct ? lastRank : i + 1;
    lastPct = r.percentage;
    lastRank = rk;
    return { ...r, rank: rk };
  });
}

/** SGPA = Σ(credits × gradePoint) / Σcredits (college pack). */
export function sgpa(rows: { credits: number; gradePoint: number }[]) {
  const c = rows.reduce((s, r) => s + r.credits, 0);
  return c ? Math.round((rows.reduce((s, r) => s + r.credits * r.gradePoint, 0) / c) * 100) / 100 : 0;
}
