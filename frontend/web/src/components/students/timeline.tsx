import { CalendarX2, CheckCircle2, ClipboardCheck, GraduationCap, IndianRupee, ShieldAlert, Trophy, type LucideIcon } from 'lucide-react';
import { cx } from '@/lib/format';
import { EmptyState } from '@/components/ui';

const ICON: Record<string, LucideIcon> = { admission: GraduationCap, attendance: ClipboardCheck, fees: IndianRupee, exam: Trophy, behaviour: ShieldAlert, leave: CalendarX2 };
const TONE: Record<string, string> = { ok: 'bg-ok-soft text-ok', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn', info: 'bg-info-soft text-info' };

export function Timeline({ items }: { items: { at: string; kind: string; title: string; detail: string | null; tone: string }[] }) {
  if (!items.length) return <EmptyState compact icon={CheckCircle2} title="Nothing on the timeline yet" />;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
      {items.map((e, i) => {
        const Icon = ICON[e.kind] ?? CheckCircle2;
        return (
          <li key={i} className="relative flex gap-3">
            <span className={cx('relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-surface', TONE[e.tone] ?? TONE.info)}><Icon className="size-4" aria-hidden /></span>
            <div className="min-w-0 pt-1">
              <p className="text-[13px] font-medium text-ink">{e.title}</p>
              {e.detail && <p className="text-xs text-muted">{e.detail}</p>}
              <p className="mt-0.5 text-[11px] text-faint">{new Date(e.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
