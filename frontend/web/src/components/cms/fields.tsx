'use client';
import { useEffect, useRef, useState } from 'react';
import { Bold, ChevronDown, ChevronUp, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Plus, Trash2, X } from 'lucide-react';
import type { FieldDef } from '@aadhyay/contracts';
import { cx } from '@/lib/format';
import { sanitizeClient } from '@/lib/sanitize-client';
import { PUBLIC_API_URL } from '@/lib/config';
import { Input, Select, Switch, Textarea } from '@/components/ui';
import { MediaPicker } from './media-library';

/** Minimal rich text: bold, italic, H2/H3, lists, links. Output is sanitised on every change. */
export function RichText({ value, onChange, label }: { value: string; onChange: (html: string) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = sanitizeClient(value); }, [value]);
  const cmd = (c: string, arg?: string) => { ref.current?.focus(); document.execCommand(c, false, arg); onChange(sanitizeClient(ref.current?.innerHTML ?? '')); };
  const tools = [
    { icon: Bold, label: 'Bold', run: () => cmd('bold') }, { icon: Italic, label: 'Italic', run: () => cmd('italic') },
    { icon: Heading2, label: 'Heading', run: () => cmd('formatBlock', 'H2') }, { icon: Heading3, label: 'Sub-heading', run: () => cmd('formatBlock', 'H3') },
    { icon: List, label: 'Bulleted list', run: () => cmd('insertUnorderedList') }, { icon: ListOrdered, label: 'Numbered list', run: () => cmd('insertOrderedList') },
    { icon: Link2, label: 'Link', run: () => { const url = prompt('Link address (https://…)'); if (url && /^(https?:|mailto:|tel:|\/)/.test(url)) cmd('createLink', url); } },
  ];
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</p>
      <div className="overflow-hidden rounded-md border border-line focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b border-line bg-surface-2 p-1">
          {tools.map((t) => <button key={t.label} type="button" title={t.label} aria-label={t.label} onMouseDown={(e) => e.preventDefault()} onClick={t.run} className="grid size-7 place-items-center rounded text-ink-2 hover:bg-sunken"><t.icon className="size-3.5" /></button>)}
        </div>
        <div ref={ref} role="textbox" aria-multiline aria-label={label} contentEditable suppressContentEditableWarning onInput={() => onChange(sanitizeClient(ref.current?.innerHTML ?? ''))}
          className="min-h-28 px-3 py-2 text-sm leading-relaxed outline-none [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-brand [&_a]:underline" />
      </div>
    </div>
  );
}

function ImageField({ value, onChange, label }: { value?: string; onChange: (id: string | undefined) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</p>
      {value ? (
        <div className="group relative overflow-hidden rounded-lg border border-line">
          <img src={`${PUBLIC_API_URL}/v1/files/public/${value}`} alt="" className="h-28 w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 p-1.5">
            <button type="button" onClick={() => setOpen(true)} className="rounded bg-white/95 px-2 py-0.5 text-xs font-medium">Replace</button>
            <button type="button" onClick={() => onChange(undefined)} aria-label="Remove image" className="grid size-6 place-items-center rounded bg-white/95"><X className="size-3.5" /></button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong text-[13px] text-muted hover:border-brand hover:text-brand"><ImagePlus className="size-5" />Choose image</button>
      )}
      <MediaPicker open={open} onClose={() => setOpen(false)} onPick={(m) => onChange(m.id)} />
    </div>
  );
}

function ItemsField({ def, value, onChange }: { def: FieldDef; value: Record<string, unknown>[]; onChange: (v: Record<string, unknown>[]) => void }) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const move = (i: number, d: number) => { const n = [...value]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); onChange(n); setOpen(i + d); };
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">{def.label}</p>
      <ul className="space-y-1.5">
        {value.map((item, i) => {
          const head = String(item.title ?? item.name ?? item.q ?? item.label ?? item.value ?? `${def.itemLabel ?? 'Item'} ${i + 1}`);
          return (
            <li key={i} className="rounded-lg border border-line bg-surface">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="min-w-0 flex-1 truncate px-1 text-left text-[13px] font-medium">{head || `${def.itemLabel} ${i + 1}`}</button>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="grid size-6 place-items-center rounded text-muted hover:bg-sunken disabled:opacity-30"><ChevronUp className="size-3.5" /></button>
                <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="grid size-6 place-items-center rounded text-muted hover:bg-sunken disabled:opacity-30"><ChevronDown className="size-3.5" /></button>
                <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${def.itemLabel}`} className="grid size-6 place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad"><Trash2 className="size-3.5" /></button>
              </div>
              {open === i && <div className="space-y-3 border-t border-line p-3">{(def.fields ?? []).map((f) => <FieldControl key={f.key} def={f} value={item[f.key]} onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))} />)}</div>}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => { onChange([...value, {}]); setOpen(value.length); }} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand"><Plus className="size-3.5" />Add {def.itemLabel ?? 'item'}</button>
    </div>
  );
}

/** One editable field, generated from the block registry. */
export function FieldControl({ def, value, onChange, forms }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; forms?: { key: string; name: string }[] }) {
  switch (def.type) {
    case 'textarea': return <Textarea label={def.label} hint={def.help} rows={3} value={String(value ?? '')} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'richtext': return <RichText label={def.label} value={String(value ?? '')} onChange={onChange} />;
    case 'image': return <ImageField label={def.label} value={value as string | undefined} onChange={onChange} />;
    case 'number': return <Input label={def.label} type="number" min={1} max={50} value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'toggle': return <Switch label={def.label} checked={!!value} onChange={onChange} />;
    case 'select': return <Select label={def.label} value={String(value ?? def.options?.[0]?.value ?? '')} onChange={(e) => onChange(e.target.value)} options={def.options ?? []} />;
    case 'form': return <Select label={def.label} value={String(value ?? 'admission')} onChange={(e) => onChange(e.target.value)} options={(forms?.length ? forms : [{ key: 'admission', name: 'Admission enquiry' }]).map((f) => ({ value: f.key, label: f.name }))} hint="Submissions create leads in Admissions CRM" />;
    case 'items': return <ItemsField def={def} value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []} onChange={onChange} />;
    case 'url':
    case 'text':
    default: return <Input label={def.label} hint={def.help} value={String(value ?? '')} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} className={cx(def.type === 'url' && 'font-mono text-[13px]')} />;
  }
}
