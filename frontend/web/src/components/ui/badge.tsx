import { CheckCircle2, AlertTriangle, XCircle, Info, CircleDashed, Building2, Users, BookOpen, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { SCOPE_LABEL, type ScopeLevel } from '@aadhyay/contracts';
import { cx } from '@/lib/format';

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'indigo';
const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2 ring-line',
  ok: 'bg-ok-soft text-ok ring-ok/20',
  warn: 'bg-warn-soft text-warn ring-warn/20',
  bad: 'bg-bad-soft text-bad ring-bad/20',
  info: 'bg-info-soft text-info ring-info/20',
  brand: 'bg-brand-soft text-brand ring-brand/20',
  indigo: 'bg-indigo/10 text-indigo ring-indigo/20',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Status never relies on colour alone: every tone carries an icon and a word. */
const STATUS_ICON: Partial<Record<Tone, ReactNode>> = { ok: <CheckCircle2 aria-hidden />, warn: <AlertTriangle aria-hidden />, bad: <XCircle aria-hidden />, info: <Info aria-hidden />, neutral: <CircleDashed aria-hidden /> };
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge tone={tone} icon={STATUS_ICON[tone]}>{children}</Badge>;
}

/** Maps common record states to tones. */
export function statusTone(s: string | null | undefined): Tone {
  switch ((s ?? '').toLowerCase()) {
    case 'active': case 'paid': case 'present': case 'approved': case 'published': case 'completed': case 'verified': case 'admitted': case 'won': return 'ok';
    case 'trial': case 'scheduled': case 'in_review': case 'running': case 'submitted': return 'info';
    case 'partial': case 'late': case 'pending': case 'grace': case 'half_day': case 'draft': case 'open': return 'warn';
    case 'absent': case 'unpaid': case 'overdue': case 'rejected': case 'suspended': case 'cancelled': case 'failed': case 'lost': return 'bad';
    default: return 'neutral';
  }
}
export const humanize = (s: string | null | undefined) => (s ? s.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

export function RoleBadge({ name }: { name: string }) {
  return <Badge tone="indigo">{name}</Badge>;
}

const SCOPE_ICON: Record<ScopeLevel, ReactNode> = { tenant: <Building2 aria-hidden />, section: <Users aria-hidden />, subject: <BookOpen aria-hidden />, own: <User aria-hidden /> };
export function ScopeBadge({ scope, label }: { scope: ScopeLevel; label?: string }) {
  return <Badge tone={scope === 'tenant' ? 'brand' : 'neutral'} icon={SCOPE_ICON[scope]}>{label ?? SCOPE_LABEL[scope]}</Badge>;
}

export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  // Deterministic soft tint per name so lists are scannable.
  const hues = [217, 245, 173, 32, 330, 142, 262, 4];
  const h = hues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cx('shrink-0 rounded-full object-cover ring-1 ring-line', className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cx('inline-grid shrink-0 place-items-center rounded-full font-semibold', className)} style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 70% 95%)`, color: `hsl(${h} 45% 35%)` }}>
      {initials || '?'}
    </span>
  );
}
