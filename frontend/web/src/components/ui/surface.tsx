import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/format';

/** White surface with hairline border and a whisper of shadow. The default container for content. */
export function Card({ title, description, action, children, className, bodyClassName, flush, as: Tag = 'section' }: {
  title?: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string; flush?: boolean; as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag className={cx('rounded-xl border border-line bg-surface shadow-sm', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cx(flush ? '' : 'p-5', (title || action) && !flush && 'pt-4', bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** Translucent surface for chrome that floats over the canvas (header, hero panels). Use sparingly. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('glass rounded-xl border border-white/60 shadow-md ring-1 ring-line/60', className)}>{children}</div>;
}

export type Crumb = { label: string; href?: string };
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-faint" aria-hidden />}
            {c.href && i < items.length - 1 ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined} className={i === items.length - 1 ? 'text-ink-2' : ''}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Page title block: breadcrumb, strong title, one-line description, and the page's primary actions. */
export function PageHeader({ title, description, sub, breadcrumb, actions, meta }: { title: ReactNode; description?: ReactNode; /** @deprecated use description */ sub?: ReactNode; breadcrumb?: Crumb[]; actions?: ReactNode; meta?: ReactNode }) {
  description ??= sub;
  return (
    <div className="mb-6 space-y-2">
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Section heading inside a page. */
export function SectionTitle({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between gap-3 first:mt-0">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Key/value list for detail panels. */
export function DescriptionList({ items, columns = 2 }: { items: { label: ReactNode; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4 text-sm', columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-ink">{it.value ?? <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
