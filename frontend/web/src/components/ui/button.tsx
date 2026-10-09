import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cx } from '@/lib/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background,box-shadow,color,border-color] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] [&_svg]:size-3.5',
  md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
  lg: 'h-11 px-5 text-[15px] [&_svg]:size-4',
};
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg shadow-xs hover:brightness-[1.06] active:brightness-95',
  secondary: 'border border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  subtle: 'bg-brand-soft text-brand hover:bg-brand-line/50',
  danger: 'bg-bad text-white shadow-xs hover:brightness-[1.06]',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cx(base, sizes[size], variants[variant], className);
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; trailing?: ReactNode };

/** Button with built-in loading state: shows a spinner, keeps its width and refuses double submits. */
export function Button({ variant = 'primary', size = 'md', icon, trailing, loading, className, children, disabled, type = 'button', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & Common & { loading?: boolean }) {
  return (
    <button {...p} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
      {trailing}
    </button>
  );
}

export function LinkButton({ variant = 'primary', size = 'md', icon, trailing, className, children, ...p }: ComponentProps<typeof Link> & Common) {
  return (
    <Link {...p} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
      {trailing}
    </Link>
  );
}

/** Icon-only button: `label` is required and becomes the accessible name and tooltip. */
export function IconButton({ label, variant = 'ghost', size = 'md', className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const dim = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-11' : 'size-9';
  return (
    <button type="button" aria-label={label} title={label} {...p} className={cx(base, variants[variant], dim, 'px-0 [&_svg]:size-[18px]', className)}>
      {children}
    </button>
  );
}
