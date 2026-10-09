'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, Lock, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import { expandPattern, type Conditions, type ScopeLevel } from '@aadhyay/contracts';
import { cx } from '@/lib/format';
import { call } from '@/lib/client';
import { Alert, Badge, Button, ConfirmDialog, Input, Modal, ScopeBadge, Select, Switch, Textarea, useToast } from '@/components/ui';

export interface CatalogueAction { key: string; action: string; phrase: string; scopes: ScopeLevel[]; conditions: string[]; sensitive: boolean }
export interface Catalogue {
  scopes: { key: ScopeLevel; label: string }[];
  modules: { key: string; label: string; enabled: boolean; resources: { key: string; label: string; actions: CatalogueAction[] }[] }[];
  templates: { key: string; name: string; description: string; kind: string }[];
}
export interface RoleRow {
  id: string; key: string; name: string; description: string | null; isSystem: boolean; isCustomized: boolean; members: number; canEdit: boolean;
  permissions: string[]; scopes: Record<string, ScopeLevel>; conditions: Record<string, Conditions>;
}

const COLS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print', 'manage'] as const;
const COL_LABEL: Record<string, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve', export: 'Export', print: 'Print', manage: 'Manage' };
type Grant = { scope: ScopeLevel; conditions?: Conditions };
type Draft = Map<string, Grant>;

/** Expand stored patterns (wildcards included) into explicit catalogue keys for editing. */
function toDraft(r: Pick<RoleRow, 'permissions' | 'scopes' | 'conditions'>): { draft: Draft; full: boolean; portal: boolean } {
  const draft: Draft = new Map();
  let full = false, portal = false;
  for (const p of r.permissions) {
    if (p === '*') { full = true; continue; }
    if (p === 'self.*') { portal = true; continue; }
    for (const k of expandPattern(p)) if (!draft.has(k) || k === p) draft.set(k, { scope: r.scopes[p] ?? 'tenant', conditions: r.conditions[p] });
  }
  return { draft, full, portal };
}
function fromDraft(d: Draft, portal: boolean) {
  const permissions = [...d.keys()].sort();
  if (portal) permissions.push('self.*');
  const scopes: Record<string, ScopeLevel> = {}, conditions: Record<string, Conditions> = {};
  for (const [k, g] of d) { if (g.scope !== 'tenant') scopes[k] = g.scope; if (g.conditions && Object.keys(g.conditions).length) conditions[k] = g.conditions; }
  if (portal) scopes['self.*'] = 'own';
  return { permissions, scopes, conditions };
}

type Preview = { lines: { key: string; text: string }[]; validation: { ok: boolean; problems: { reason: string }[] }; authority: { ok: boolean; problems: { key?: string; reason: string }[] } };

export function RolesManager({ roles, catalogue, canCreate, canDelete }: { roles: RoleRow[]; catalogue: Catalogue; canCreate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [selId, setSelId] = useState(roles.find((r) => r.key === 'principal')?.id ?? roles[0]?.id);
  const role = roles.find((r) => r.id === selId);
  const [creating, setCreating] = useState(false);
  const sorted = [...roles].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name));

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-3">
        {canCreate && <Button className="w-full" icon={<Plus />} onClick={() => setCreating(true)}>Create role</Button>}
        <nav aria-label="Roles" className="rounded-xl border border-line bg-surface p-1.5 shadow-sm">
          {sorted.map((r) => (
            <button key={r.id} type="button" onClick={() => setSelId(r.id)} aria-current={r.id === selId ? 'true' : undefined}
              className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', r.id === selId ? 'bg-brand-soft' : 'hover:bg-sunken')}>
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-[13.5px]', r.id === selId ? 'font-semibold text-brand' : 'font-medium text-ink')}>{r.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted"><Users className="size-3" aria-hidden />{r.members} · {r.isSystem ? (r.isCustomized ? 'Template, edited' : 'Template') : 'Custom'}</span>
              </span>
              {!r.canEdit && <Lock className="size-3.5 shrink-0 text-faint" aria-label="You cannot edit this role" />}
            </button>
          ))}
        </nav>
      </aside>
      {role && <RoleEditor key={role.id} role={role} catalogue={catalogue} canDelete={canDelete} onSaved={() => { toast({ tone: 'ok', title: 'Role saved', body: 'Changes apply to everyone with this role within a few minutes.' }); router.refresh(); }} />}
      <CreateRoleModal open={creating} onClose={() => setCreating(false)} roles={roles} catalogue={catalogue} onCreated={(id) => { setCreating(false); setSelId(id); router.refresh(); toast({ tone: 'ok', title: 'Role created' }); }} />
    </div>
  );
}

function RoleEditor({ role, catalogue, canDelete, onSaved }: { role: RoleRow; catalogue: Catalogue; canDelete: boolean; onSaved: () => void }) {
  const router = useRouter();
  const init = useMemo(() => toDraft(role), [role]);
  const [draft, setDraft] = useState<Draft>(init.draft);
  const [portal, setPortal] = useState(init.portal);
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description ?? '');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = !role.canEdit || init.full;
  const payload = useMemo(() => fromDraft(draft, portal), [draft, portal]);
  const dirty = JSON.stringify(payload) !== JSON.stringify(fromDraft(init.draft, init.portal)) || name !== role.name || desc !== (role.description ?? '');

  useEffect(() => {
    if (init.full) return;
    const t = setTimeout(() => { call<Preview>('/access/roles/preview', { body: payload }).then(setPreview).catch(() => setPreview(null)); }, 250);
    return () => clearTimeout(t);
  }, [payload, init.full]);

  const set = (key: string, g: Grant | null) => setDraft((d) => { const n = new Map(d); if (g) n.set(key, g); else n.delete(key); return n; });
  const problems = [...(preview?.validation.problems ?? []), ...(preview?.authority.problems ?? [])];
  const blocked = new Set((preview?.authority.problems ?? []).map((p) => p.key).filter(Boolean));

  async function save() {
    setSaving(true); setError('');
    try { await call(`/org/roles/${role.id}`, { method: 'PATCH', body: { name, description: desc || undefined, ...payload } }); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            {readOnly ? (
              <div><h2 className="text-lg font-semibold">{role.name}</h2>{role.description && <p className="mt-1 max-w-2xl text-sm text-muted">{role.description}</p>}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr]">
                <Input label="Role name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this role is for" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge tone={role.isSystem ? 'neutral' : 'indigo'}>{role.isSystem ? 'Template role' : 'Custom role'}</Badge>
              <Badge><Users className="size-3" aria-hidden />{role.members} {role.members === 1 ? 'person' : 'people'}</Badge>
              {init.full && <Badge tone="brand">Full access</Badge>}
            </div>
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              {!role.isSystem && canDelete && <Button variant="ghost" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>Delete</Button>}
              <Button onClick={save} loading={saving} disabled={!dirty || problems.length > 0} icon={<Check />}>Save changes</Button>
            </div>
          )}
        </div>
        {init.full && <Alert className="mt-4" tone="info" title="The Owner role always has full access">It covers every module, setting and record, and cannot be narrowed. Give people a narrower role instead.</Alert>}
        {!init.full && !role.canEdit && <Alert className="mt-4" tone="warn" title="You can view this role but not change it">It includes permissions you don’t hold for the whole institution. Only someone who holds all of them (usually the Owner) can edit it.</Alert>}
        {error && <Alert className="mt-4" tone="bad">{error}</Alert>}
      </div>

      {!init.full && (
        <div className="grid gap-4 2xl:grid-cols-[1fr_320px]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            {portal !== undefined && (init.portal || role.isSystem === false) && (
              <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
                <div><p className="text-[13px] font-medium">Family portal</p><p className="text-xs text-muted">Own (or own children’s) attendance, homework, fees, results, bus and notices.</p></div>
                <Switch checked={portal} onChange={setPortal} disabled={readOnly} label={<span className="sr-only">Family portal</span>} />
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="w-[30%] px-4 py-2.5 text-left font-medium">Module · area</th>
                    {COLS.map((c) => <th key={c} scope="col" className="px-1 py-2.5 text-center font-medium">{COL_LABEL[c]}</th>)}
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">Other</th>
                  </tr>
                </thead>
                {catalogue.modules.map((m) => (
                  <tbody key={m.key} className={cx(!m.enabled && 'opacity-55')}>
                    <tr className="border-b border-line bg-sunken/60"><th colSpan={COLS.length + 2} scope="rowgroup" className="px-4 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-2">{m.label}{!m.enabled && <span className="ml-2 font-normal normal-case text-muted">Module not enabled for this institution</span>}</th></tr>
                    {m.resources.map((r) => {
                      const rowKey = `${m.key}.${r.key}`;
                      const granted = r.actions.filter((a) => draft.has(a.key));
                      const configurable = granted.filter((a) => a.scopes.length > 1 || a.conditions.length);
                      const narrowed = granted.filter((a) => draft.get(a.key)!.scope !== 'tenant' || draft.get(a.key)!.conditions);
                      const others = r.actions.filter((a) => !(COLS as readonly string[]).includes(a.action));
                      return [
                        <tr key={rowKey} className="border-b border-line/70 hover:bg-surface-2/60">
                          <th scope="row" className="px-4 py-2 text-left font-normal">
                            <button type="button" disabled={!configurable.length} onClick={() => setOpen((o) => { const n = new Set(o); n.has(rowKey) ? n.delete(rowKey) : n.add(rowKey); return n; })} aria-expanded={open.has(rowKey)}
                              className="flex items-center gap-1.5 text-left text-ink disabled:cursor-default">
                              <ChevronRight className={cx('size-3.5 shrink-0 text-faint transition-transform', open.has(rowKey) && 'rotate-90', !configurable.length && 'invisible')} aria-hidden />
                              {r.label}
                              {narrowed.length > 0 && <span className="ml-1 rounded bg-indigo/10 px-1 text-[10px] font-medium text-indigo">limited</span>}
                            </button>
                          </th>
                          {COLS.map((c) => {
                            const a = r.actions.find((x) => x.action === c);
                            if (!a) return <td key={c} className="px-1 py-2 text-center text-faint" aria-hidden>·</td>;
                            const on = draft.has(a.key);
                            return (
                              <td key={c} className="px-1 py-2 text-center">
                                <label className="inline-grid size-7 cursor-pointer place-items-center rounded-md hover:bg-sunken" title={`${a.phrase}${a.sensitive ? ' (sensitive data)' : ''}`}>
                                  <input type="checkbox" className={cx('size-4 accent-[var(--color-brand)]', blocked.has(a.key) && 'outline outline-2 outline-bad')} checked={on} disabled={readOnly}
                                    aria-label={`${m.label} ${r.label}: ${a.phrase}`} onChange={() => set(a.key, on ? null : { scope: a.scopes[0] === 'tenant' ? 'tenant' : a.scopes[0]! })} />
                                </label>
                                {a.sensitive && <ShieldAlert className="mx-auto -mt-1 size-3 text-warn" aria-label="Sensitive" />}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {others.map((a) => {
                                const on = draft.has(a.key);
                                return (
                                  <button key={a.key} type="button" disabled={readOnly} aria-pressed={on} onClick={() => set(a.key, on ? null : { scope: a.scopes[0]! })} title={a.phrase}
                                    className={cx('rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize', on ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong', blocked.has(a.key) && 'border-bad text-bad')}>
                                    {on && <Check className="mr-0.5 inline size-3" aria-hidden />}{a.action}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>,
                        open.has(rowKey) && (
                          <tr key={`${rowKey}-x`} className="border-b border-line/70 bg-surface-2/70">
                            <td colSpan={COLS.length + 2} className="px-4 py-3 pl-10">
                              <div className="grid gap-3 md:grid-cols-2">
                                {configurable.map((a) => <GrantDetail key={a.key} action={a} grant={draft.get(a.key)!} scopes={catalogue.scopes} readOnly={readOnly} onChange={(g) => set(a.key, g)} />)}
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </div>

          <aside className="space-y-4 order-first 2xl:order-last 2xl:sticky 2xl:top-20 2xl:self-start">
            {problems.length > 0 && (
              <Alert tone="bad" title={readOnly ? 'Why you can’t edit this role' : 'Fix before saving'}>
                <ul className="mt-1 list-disc space-y-1 pl-4">{problems.slice(0, 6).map((p, i) => <li key={i}>{p.reason}</li>)}</ul>
                {problems.length > 6 && <p className="mt-1">…and {problems.length - 6} more.</p>}
              </Alert>
            )}
            <section className="rounded-xl border border-line bg-surface shadow-sm">
              <h3 className="border-b border-line px-4 py-3 text-[13px] font-semibold">In plain words <span className="font-normal text-muted">· {(preview?.lines.length ?? 0) + (portal ? 1 : 0)} permissions</span></h3>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto p-4 text-[13px] text-ink-2 scrollbar-thin sm:columns-2 2xl:max-h-[60vh] 2xl:columns-1 [&>li]:break-inside-avoid">
                {portal && <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />Can see their own (or their children’s) records.</li>}
                {(preview?.lines ?? []).filter((l) => l.key !== 'self.*').map((l) => <li key={l.key} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />{l.text}</li>)}
                {!preview?.lines.length && !portal && <li className="text-muted">This role grants nothing yet. Tick boxes in the matrix.</li>}
              </ul>
            </section>
          </aside>
        </div>
      )}

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete “${role.name}”?`} confirmLabel="Delete role"
        consequence={role.members ? <>This role is held by {role.members} {role.members === 1 ? 'person' : 'people'}. Move them to another role first — the server will refuse otherwise.</> : <>The role is removed permanently. The change is recorded in the audit log.</>}
        onConfirm={async () => { await call(`/org/roles/${role.id}`, { method: 'DELETE' }); router.refresh(); }} />
    </div>
  );
}

function GrantDetail({ action, grant, scopes, readOnly, onChange }: { action: CatalogueAction; grant: Grant; scopes: Catalogue['scopes']; readOnly: boolean; onChange: (g: Grant) => void }) {
  const c = grant.conditions ?? {};
  const setC = (patch: Partial<Conditions>) => {
    const next = { ...c, ...patch };
    for (const k of Object.keys(next) as (keyof Conditions)[]) if (next[k] === undefined || next[k] === false) delete next[k];
    onChange({ ...grant, conditions: Object.keys(next).length ? next : undefined });
  };
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-[13px] font-medium capitalize text-ink">{action.phrase}</p>
      <div className="mt-2 space-y-2">
        {action.scopes.length > 1 ? (
          <Select label="Applies to" value={grant.scope} disabled={readOnly} onChange={(e) => onChange({ ...grant, scope: e.target.value as ScopeLevel })}
            options={action.scopes.map((s) => ({ value: s, label: scopes.find((x) => x.key === s)?.label ?? s }))} />
        ) : <ScopeBadge scope={grant.scope} />}
        {action.conditions.includes('maxAmountPaise') && (
          <Input label="Amount limit (₹)" type="number" min={0} inputMode="numeric" disabled={readOnly} placeholder="No limit" value={c.maxAmountPaise !== undefined ? c.maxAmountPaise / 100 : ''}
            onChange={(e) => setC({ maxAmountPaise: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100) })} />
        )}
        {action.conditions.includes('sameDayOnly') && <Switch checked={!!c.sameDayOnly} disabled={readOnly} onChange={(v) => setC({ sameDayOnly: v })} label="Same day only" description="Only records dated today" />}
        {action.conditions.includes('makerChecker') && <Switch checked={!!c.makerChecker} disabled={readOnly} onChange={(v) => setC({ makerChecker: v })} label="Needs a second approver" description="Maker-checker" />}
      </div>
    </div>
  );
}

function CreateRoleModal({ open, onClose, roles, catalogue, onCreated }: { open: boolean; onClose: () => void; roles: RoleRow[]; catalogue: Catalogue; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(''); setDescription(''); setFrom(''); setErr(''); } }, [open]);
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  const create = async () => {
    setBusy(true); setErr('');
    try {
      const src = roles.find((r) => r.id === from);
      const base = src ? fromDraft(toDraft(src).draft, toDraft(src).portal) : { permissions: ['org.settings.view'], scopes: {}, conditions: {} };
      const r = await call<{ id: string }>('/org/roles', { body: { key: `${key}_${Date.now().toString(36).slice(-4)}`, name, description: description || undefined, ...base } });
      onCreated(r.id);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the role'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Create a role" description="Start from an existing role and adjust, or start small and add permissions."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={create} loading={busy} disabled={name.trim().length < 2} icon={<Plus />}>Create role</Button></>}>
      <div className="space-y-4">
        <Input label="Role name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Exam coordinator" />
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who gets this role and why" />
        <Select label="Copy permissions from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Start almost empty (view settings only)"
          options={roles.filter((r) => !r.permissions.includes('*')).map((r) => ({ value: r.id, label: r.name }))} hint={<span className="inline-flex items-center gap-1"><Copy className="size-3" />You can only copy roles whose permissions you hold yourself.</span>} />
        {err && <Alert tone="bad">{err}</Alert>}
      </div>
    </Modal>
  );
}
