/** Tiny trend line for stat tiles (no axes, no hover — the tile states the value). Server-renderable. */
export function Sparkline({ values, color = 'var(--color-series-1)', height = 32, label }: { values: number[]; color?: string; height?: number; label?: string }) {
  if (values.length < 2) return null;
  const W = 120, H = height, pad = 3;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i * (W - pad * 2)) / (values.length - 1), H - pad - ((v - min) / span) * (H - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full overflow-visible" role="img" aria-label={label ?? `Trend over ${values.length} periods`}>
      <path d={`${d}L${last[0]},${H}L${pts[0]![0]},${H}Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
