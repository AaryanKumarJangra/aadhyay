'use client';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '@/lib/format';

export const controlClass =
  'w-full rounded-md border border-line bg-surface text-sm text-ink shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-line-strong focus:border-brand focus:ring-3 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-bad aria-[invalid=true]:focus:ring-bad/15';

interface FieldProps { label?: ReactNode; hint?: ReactNode; error?: string; required?: boolean; className?: string; id?: string; children: (id: string, describedBy: string | undefined) => ReactNode }

/** Label + control + hint/error, wired for screen readers (aria-describedby, aria-invalid). */
export function Field({ label, hint, error, required, className, id, children }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const hintId = hint || error ? `${fid}-msg` : undefined;
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={fid} className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
          {label}
          {required && <span className="text-bad" aria-hidden>*</span>}
          {required && <span className="sr-only">(required)</span>}
        </label>
      )}
      {children(fid, hintId)}
      {error ? <p id={hintId} role="alert" className="text-xs text-bad">{error}</p> : hint ? <p id={hintId} className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

type Extra = { label?: ReactNode; hint?: ReactNode; error?: string; wrapperClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Extra & { leading?: ReactNode }>(function Input(
  { label, hint, error, required, className, wrapperClassName, leading, id, ...p }, ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName} id={id}>
      {(fid, d) => (
        <div className="relative">
          {leading && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-faint [&_svg]:size-4">{leading}</span>}
          <input ref={ref} id={fid} aria-describedby={d} aria-invalid={!!error || undefined} required={required} {...p} className={cx(controlClass, 'h-9 px-3', leading && 'pl-9', className)} />
        </div>
      )}
    </Field>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Extra>(function Textarea(
  { label, hint, error, required, className, wrapperClassName, id, rows = 4, ...p }, ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName} id={id}>
      {(fid, d) => <textarea ref={ref} id={fid} rows={rows} aria-describedby={d} aria-invalid={!!error || undefined} required={required} {...p} className={cx(controlClass, 'px-3 py-2 leading-relaxed', className)} />}
    </Field>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Extra & { options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string }>(function Select(
  { label, hint, error, required, className, wrapperClassName, options, placeholder, id, ...p }, ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName} id={id}>
      {(fid, d) => (
        <div className="relative">
          <select ref={ref} id={fid} aria-describedby={d} aria-invalid={!!error || undefined} required={required} {...p} className={cx(controlClass, 'h-9 appearance-none pl-3 pr-9', className)}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        </div>
      )}
    </Field>
  );
});

export function Checkbox({ label, description, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-2.5 text-sm', p.disabled && 'cursor-not-allowed opacity-60', className)}>
      <input type="checkbox" {...p} className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-[var(--color-brand)]" />
      <span><span className="text-ink">{label}</span>{description && <span className="block text-xs text-muted">{description}</span>}</span>
    </label>
  );
}

/** Accessible switch (role="switch"); `onChange(checked)`. */
export function Switch({ checked, onChange, label, description, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      {(label || description) && (
        <label htmlFor={id} className="text-sm"><span className="font-medium text-ink">{label}</span>{description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}</label>
      )}
      <button
        id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand' : 'bg-line-strong')}
      >
        <span className={cx('inline-block size-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/** Segmented control for 2–5 mutually exclusive options. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('rounded-[5px] font-medium transition-colors', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]', value === o.value ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
