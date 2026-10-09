'use client';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cx } from '@/lib/format';
import { SERIES, fmt, niceTicks, type Format } from './scale';

export interface Series { key: string; label: string; values: (number | null)[]; color?: string }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Legend({ items, kind }: { items: { label: string; color: string }[]; kind: 'line' | 'rect' }) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span aria-hidden className={kind === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-[3px]'} style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, width, title, rows, format }: { x: number; width: number; title: string; rows: { label: string; value: number | null; color: string }[]; format: (n: number) => string }) {
  const left = x > width - 170 ? x - 12 : x + 12;
  return (
    <div role="status" className={cx('pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-md backdrop-blur', x > width - 170 && '-translate-x-full')} style={{ left }}>
      <p className="mb-1 font-medium text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted"><span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />{r.label}</span>
          <span className="font-semibold tabular text-ink">{r.value === null ? '—' : format(r.value)}</span>
        </p>
      ))}
    </div>
  );
}

const M = { top: 8, right: 12, bottom: 24, left: 44 };

/** Index ranges [start, end] of consecutive non-null values (areas never bridge missing data). */
function runs(values: (number | null)[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  values.forEach((v, i) => {
    if (v !== null && start < 0) start = i;
    if ((v === null || i === values.length - 1) && start >= 0) { out.push([start, v === null ? i - 1 : i]); start = -1; }
  });
  return out;
}

/** Change over time. Crosshair snaps to the nearest point; tooltip lists every series; arrow keys move it. */
export function AreaChart({ labels, series, format: f, height = 220, yMax }: { labels: string[]; series: Series[]; format?: Format; height?: number; yMax?: number }) {
  const format = fmt(f);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }));
  const max = yMax ?? Math.max(0, ...colored.flatMap((s) => s.values.map((v) => v ?? 0)));
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1]!;
  const pw = Math.max(0, width - M.left - M.right), ph = height - M.top - M.bottom;
  const x = (i: number) => M.left + (labels.length < 2 ? pw / 2 : (i * pw) / (labels.length - 1));
  const y = (v: number) => M.top + ph - (v / (top || 1)) * ph;
  const path = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? '' : `${i && vals[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(pw / 72))));
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - M.left;
    setHover(Math.max(0, Math.min(labels.length - 1, Math.round((px / (pw || 1)) * (labels.length - 1)))));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(labels.length - 1, (h ?? -1) + 1));
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? labels.length) - 1));
  };
  return (
    <div>
      <Legend items={colored.map((s) => ({ label: s.label, color: s.color }))} kind="line" />
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${colored.map((s) => s.label).join(', ')} over ${labels.length} periods. Use arrow keys to read values.`} tabIndex={0}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onFocus={() => setHover((h) => h ?? labels.length - 1)} onBlur={() => setHover(null)} className="touch-pan-y outline-none">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--color-axis)' : 'var(--color-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular">{format(t)}</text>
              </g>
            ))}
            {labels.map((l, i) => (i % step === 0 || (i === labels.length - 1 && (labels.length - 1) % step >= step / 2)) && (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} className="fill-muted text-[11px]">{l}</text>
            ))}
            {colored.length === 1 && runs(colored[0]!.values).map(([a, b]) => (
              <path key={a} d={`${path(colored[0]!.values.map((v, i) => (i >= a && i <= b ? v : null)))}L${x(b)},${y(0)}L${x(a)},${y(0)}Z`} fill={colored[0]!.color} opacity={0.1} />
            ))}
            {colored.map((s) => <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ph} stroke="var(--color-axis)" strokeWidth={1} />
                {colored.map((s) => s.values[hover] !== null && <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />)}
              </g>
            )}
          </svg>
        )}
        {hover !== null && width > 0 && <Tooltip x={x(hover)} width={width} title={labels[hover]!} rows={colored.map((s) => ({ label: s.label, value: s.values[hover] ?? null, color: s.color }))} format={format} />}
      </div>
    </div>
  );
}

/** Magnitude by category (columns). Each category band is the hit target; bars ≤ 24px with a 4px rounded cap. */
export function BarChart({ categories, series, format: f, height = 220 }: { categories: string[]; series: Series[]; format?: Format; height?: number }) {
  const format = fmt(f);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }));
  const max = Math.max(0, ...colored.flatMap((s) => s.values.map((v) => v ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const pw = Math.max(0, width - M.left - M.right), ph = height - M.top - M.bottom;
  const band = categories.length ? pw / categories.length : 0;
  const barW = Math.max(4, Math.min(24, (band * 0.7 - (colored.length - 1) * 2) / colored.length));
  const groupW = barW * colored.length + (colored.length - 1) * 2;
  const y = (v: number) => M.top + ph - (v / (top || 1)) * ph;
  const step = Math.max(1, Math.ceil(categories.length / Math.max(2, Math.floor(pw / 56))));
  const bar = (x0: number, v: number) => {
    const h = Math.max(0, y(0) - y(v)), r = Math.min(4, h, barW / 2), yt = y(v);
    return `M${x0},${y(0)}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + barW - r}Q${x0 + barW},${yt} ${x0 + barW},${yt + r}V${y(0)}Z`;
  };
  return (
    <div>
      <Legend items={colored.map((s) => ({ label: s.label, color: s.color }))} kind="rect" />
      <div ref={ref} className="relative" style={{ height }} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${colored.map((s) => s.label).join(', ')} by category`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--color-axis)' : 'var(--color-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular">{format(t)}</text>
              </g>
            ))}
            {categories.map((c, i) => {
              const gx = M.left + i * band + (band - groupW) / 2;
              return (
                <g key={c} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${c}: ${colored.map((s) => `${s.label} ${s.values[i] === null ? 'no data' : format(s.values[i]!)}`).join(', ')}`} className="outline-none">
                  <rect x={M.left + i * band} y={M.top} width={band} height={ph} fill={hover === i ? 'var(--color-sunken)' : 'transparent'} />
                  {colored.map((s, j) => s.values[i] ? <path key={s.key} d={bar(gx + j * (barW + 2), s.values[i]!)} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} /> : null)}
                  {(i % step === 0) && <text x={M.left + i * band + band / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[11px]">{c.length > 10 ? `${c.slice(0, 9)}…` : c}</text>}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && width > 0 && <Tooltip x={M.left + hover * band + band / 2} width={width} title={categories[hover]!} rows={colored.map((s) => ({ label: s.label, value: s.values[hover] ?? null, color: s.color }))} format={format} />}
      </div>
    </div>
  );
}

/** Ranked horizontal bars with labels and values in text (for long category names: classes, routes, plans). */
export function BarList({ rows, format: f, max, color = 'var(--color-series-1)', empty }: { rows: { label: ReactNode; value: number; hint?: ReactNode; href?: string }[]; format?: Format; max?: number; color?: string; empty?: ReactNode }) {
  const format = fmt(f);
  if (!rows.length) return <>{empty}</>;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={i} className="text-[13px]">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-ink-2">{r.label}</span>
            <span className="shrink-0 tabular font-medium text-ink">{format(r.value)}{r.hint && <span className="ml-1.5 font-normal text-muted">{r.hint}</span>}</span>
          </div>
          <div className="h-1.5 rounded-full bg-sunken" role="presentation">
            <div className="h-1.5 rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Part-to-whole for ≤ 6 parts. The legend carries label, value and share, so colour is never the only key. */
export function Donut({ segments, format: f, centerLabel, size = 148 }: { segments: { label: string; value: number; color?: string }[]; format?: Format; centerLabel?: string; size?: number }) {
  const format = fmt(f);
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const segs = segments.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }));
  const r = size / 2 - 10, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center lg:flex-col xl:flex-row">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={segs.map((s) => `${s.label} ${format(s.value)}`).join(', ')} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={16} />
          {total > 0 && segs.map((s, i) => {
            const len = (s.value / total) * C;
            const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={hover === i ? 18 : 16} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="transition-[stroke-width]" />;
            acc += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-lg font-semibold tabular text-ink">{hover !== null ? format(segs[hover]!.value) : format(total)}</p>
            <p className="text-[11px] text-muted">{hover !== null ? segs[hover]!.label : centerLabel ?? 'Total'}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2 text-[13px]">
        {segs.map((s, i) => (
          <li key={s.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className={cx('flex items-center justify-between gap-3 rounded-md px-1.5 py-0.5', hover === i && 'bg-sunken')}>
            <span className="flex min-w-0 items-center gap-2 text-ink-2"><span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} /><span className="break-words">{s.label}</span></span>
            <span className="shrink-0 tabular text-ink">{format(s.value)} <span className="text-muted">{total ? `${Math.round((s.value / total) * 100)}%` : ''}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
