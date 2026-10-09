'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, KeyRound, ShieldCheck, UserPlus, UserX, X } from 'lucide-react';
import { effectiveAccess, type EffectiveRow, type Grant, type ScopeLevel } from '@aadhyay/contracts';
import { call } from '@/lib/client';
import { cx } from '@/lib/format';
import { Alert, Avatar, Badge, Button, Checkbox, ConfirmDialog, DataTable, Drawer, Input, Modal, RoleBadge, ScopeBadge, Select, StatusBadge, useToast, type Column } from '@/components/ui';
import { EffectiveAccessList } from './effective-access';
import type { RoleRow } from './role-editor';

export interface Member {
  membershipId: string; name: string; phone: string | null; email: string | null; status: string; lastActiveAt: string | null;
  roles: { roleKey: string; roleName: string; scopeKind: string; scopeId: string | null }[];
}
type Tree = { id: string; name: string; sections: { id: string; name: string }[] }[];
type ScopeKind = 'tenant' | 'class' | 'section';

/** Things people most often need to know someone CANNOT do (brief §21). */
const NOTABLE: { key: string; label: string }[] = [
  { key: 'fees.payment.view', label: 'view fees' }, { key: 'fees.payment.refund', label: 'refund fees' }, { key: 'people.staff.edit', label: 'manage staff' },
  { key: 'cms.page.publish', label: 'publish the website' }, { key: 'org.role.edit', label: 'manage roles' }, { key: 'payroll.salary.view', label: 'see salaries' },
  { key: 'people.contact.view', label: 'see phone numbers' }, { key: 'exams.result.publish', label: 'publish results' },
];

/** What a set of roles would allow, computed with the shared engine (UI preview; the API decides for real). */
function previewOf(roles: RoleRow[], scopeKind: ScopeKind, modules: string[]): EffectiveRow[] {
  const grants: Grant[] = roles.flatMap((r) => r.permissions.map((pattern) => {
    let scope = (r.scopes[pattern] ?? 'tenant') as ScopeLevel;
    if (scopeKind !== 'tenant' && scope === 'tenant') scope = 'section';
    return { pattern, scope, conditions: r.conditions[pattern], source: { roleKey: r.key, roleName: r.name } };
  }));
  return effectiveAccess({ userId: '', grants, modules, self: { studentIds: [] } });
}

export function MembersManager({ members, roles, modules, canInvite, canEdit, canRemove }: { members: Member[]; roles: RoleRow[]; modules: string[]; canInvite: boolean; canEdit: boolean; canRemove: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [manage, setManage] = useState<Member | null>(null);
  const [invite, setInvite] = useState(false);
  const [deactivate, setDeactivate] = useState<Member[] | null>(null);
  const [tree, setTree] = useState<Tree | null>(null);
  useEffect(() => { fetch('/api/v1/academics/tree').then((r) => (r.ok ? r.json() : null)).then(setTree).catch(() => setTree(null)); }, []);
  const sectionName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of tree ?? []) { m.set(c.id, c.name); for (const s of c.sections) m.set(s.id, `${c.name}-${s.name}`); }
    return m;
  }, [tree]);

  const columns: Column<Member>[] = [
    { key: 'name', header: 'Name', mobile: 'primary', value: (m) => m.name, cell: (m) => <span className="flex items-center gap-2.5"><Avatar name={m.name} size={28} /><span><span className="block font-medium text-ink">{m.name}</span><span className="block text-xs text-muted">{m.phone ?? m.email ?? '—'}</span></span></span> },
    { key: 'roles', header: 'Roles', value: (m) => m.roles.map((r) => r.roleName).join(', '), cell: (m) => m.roles.length ? <span className="flex flex-wrap gap-1">{m.roles.map((r) => <RoleBadge key={r.roleKey} name={r.roleName} />)}</span> : <span className="text-xs text-muted">No role — can’t use the console</span> },
    { key: 'scope', header: 'Applies to', value: (m) => m.roles.map((r) => r.scopeKind).join(','), cell: (m) => {
      const r = m.roles.find((x) => x.scopeId);
      return r ? <ScopeBadge scope="section" label={sectionName.get(r.scopeId!) ?? (r.scopeKind === 'class' ? 'One class' : 'One section')} /> : <span className="text-xs text-muted">Per role</span>;
    } },
    { key: 'last', header: 'Last active', value: (m) => m.lastActiveAt ?? '', cell: (m) => m.lastActiveAt ? new Date(m.lastActiveAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : <span className="text-xs text-muted">Never signed in</span> },
    { key: 'status', header: 'Status', value: (m) => m.status, cell: (m) => <StatusBadge tone={m.status === 'active' ? 'ok' : 'neutral'}>{m.status === 'active' ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', sortable: false, mobile: 'hide', cell: (m) => <Button size="sm" variant="secondary" icon={<KeyRound />} onClick={() => setManage(m)}>Access</Button> },
  ];

  return (
    <>
      <DataTable
        rows={members} columns={columns} rowKey={(m) => m.membershipId} label="people" exportName="staff-logins" searchPlaceholder="Search name, phone or role"
        toolbar={canInvite ? <Button icon={<UserPlus />} onClick={() => setInvite(true)}>Invite</Button> : undefined}
        bulkActions={canRemove ? (sel) => <Button size="sm" variant="danger" icon={<UserX />} onClick={() => setDeactivate(sel)}>Deactivate</Button> : undefined}
        empty={{ title: 'No staff logins yet', description: 'Invite staff so they can sign in with their phone number.', action: canInvite ? <Button icon={<UserPlus />} onClick={() => setInvite(true)}>Invite staff</Button> : undefined }}
      />
      {manage && <ManageAccess member={manage} roles={roles} tree={tree} modules={modules} canEdit={canEdit} canRemove={canRemove} onClose={() => setManage(null)}
        onDeactivate={() => { setDeactivate([manage]); setManage(null); }} onSaved={() => { setManage(null); toast({ tone: 'ok', title: 'Access updated', body: `${manage.name}’s roles were saved.` }); router.refresh(); }} />}
      <InviteModal open={invite} onClose={() => setInvite(false)} roles={roles} tree={tree} onDone={(n) => { setInvite(false); toast({ tone: 'ok', title: 'Invitation sent', body: `${n} can now sign in with their phone number.` }); router.refresh(); }} />
      <ConfirmDialog open={!!deactivate} onClose={() => setDeactivate(null)} reason="optional" confirmLabel="Deactivate"
        title={deactivate?.length === 1 ? `Deactivate ${deactivate[0]!.name}?` : `Deactivate ${deactivate?.length} people?`}
        consequence={<>They will be signed out of this institution and lose access immediately. Their records stay; you can invite them again later.</>}
        onConfirm={async () => {
          const failed: string[] = [];
          for (const m of deactivate ?? []) { try { await call(`/org/members/${m.membershipId}`, { method: 'DELETE' }); } catch (e) { failed.push(`${m.name}: ${e instanceof Error ? e.message : 'failed'}`); } }
          router.refresh();
          if (failed.length) throw new Error(failed.join(' · '));
        }} />
    </>
  );
}

function ScopePicker({ kind, id, tree, onChange }: { kind: ScopeKind; id: string; tree: Tree | null; onChange: (k: ScopeKind, id: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select label="Applies to" value={kind} onChange={(e) => onChange(e.target.value as ScopeKind, '')}
        options={[{ value: 'tenant', label: 'As each role defines (recommended)' }, ...(tree ? [{ value: 'class', label: 'One class only' }, { value: 'section', label: 'One section only' }] : [])]}
        hint="Teachers are automatically limited to the classes and subjects they teach." />
      {kind === 'class' && <Select label="Class" required value={id} onChange={(e) => onChange('class', e.target.value)} placeholder="Choose a class" options={(tree ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
      {kind === 'section' && <Select label="Section" required value={id} onChange={(e) => onChange('section', e.target.value)} placeholder="Choose a section" options={(tree ?? []).flatMap((c) => c.sections.map((s) => ({ value: s.id, label: `${c.name}-${s.name}` })))} />}
    </div>
  );
}

function RolePicker({ roles, selected, onToggle }: { roles: RoleRow[]; selected: Set<string>; onToggle: (k: string) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Roles</legend>
      {roles.filter((r) => !r.permissions.includes('self.*')).map((r) => (
        <div key={r.key} className={cx('rounded-lg border px-3 py-2', selected.has(r.key) ? 'border-brand/30 bg-brand-soft/60' : 'border-line')}>
          <Checkbox label={<span className="font-medium">{r.name}</span>} description={r.canEdit ? r.description ?? undefined : 'You can’t give this role — it includes permissions you don’t hold.'}
            checked={selected.has(r.key)} disabled={!r.canEdit && !selected.has(r.key)} onChange={() => onToggle(r.key)} />
        </div>
      ))}
    </fieldset>
  );
}

function CanCannot({ rows }: { rows: EffectiveRow[] }) {
  const have = new Set(rows.map((r) => r.key));
  const can = rows.slice(0, 8);
  const cannot = NOTABLE.filter((n) => !have.has(n.key));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-line p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ok">Can</p>
        <ul className="space-y-1 text-[13px] text-ink-2">{can.length ? can.map((r) => <li key={r.key} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-ok" />{r.explanation.replace(/^Can /, '')}</li>) : <li className="text-muted">Nothing yet</li>}{rows.length > 8 && <li className="text-xs text-muted">+ {rows.length - 8} more</li>}</ul>
      </div>
      <div className="rounded-lg border border-line p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bad">Cannot</p>
        <ul className="space-y-1 text-[13px] text-ink-2">{cannot.length ? cannot.map((n) => <li key={n.key} className="flex gap-1.5"><X className="mt-0.5 size-3.5 shrink-0 text-bad" />{n.label}</li>) : <li className="text-muted">No notable restrictions</li>}</ul>
      </div>
    </div>
  );
}

function ManageAccess({ member, roles, tree, modules, canEdit, canRemove, onClose, onSaved, onDeactivate }: { member: Member; roles: RoleRow[]; tree: Tree | null; modules: string[]; canEdit: boolean; canRemove: boolean; onClose: () => void; onSaved: () => void; onDeactivate: () => void }) {
  const [tab, setTab] = useState<'roles' | 'effective'>('roles');
  const [selected, setSelected] = useState(new Set(member.roles.map((r) => r.roleKey)));
  const first = member.roles.find((r) => r.scopeId);
  const [scope, setScope] = useState<{ kind: ScopeKind; id: string }>({ kind: (first?.scopeKind as ScopeKind) ?? 'tenant', id: first?.scopeId ?? '' });
  const [eff, setEff] = useState<EffectiveRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (tab !== 'effective' || eff) return;
    call<{ rows: EffectiveRow[] }>(`/access/members/${member.membershipId}`).then((r) => setEff(r.rows)).catch((e) => setError(e.message));
  }, [tab, eff, member.membershipId]);
  const chosen = roles.filter((r) => selected.has(r.key));
  const preview = useMemo(() => previewOf(chosen, scope.kind, modules), [chosen, scope.kind, modules]);
  const save = async () => {
    setSaving(true); setError('');
    try { await call(`/org/members/${member.membershipId}/roles`, { body: { roleKeys: [...selected], scopeKind: scope.kind, scopeId: scope.id || undefined, replace: true } }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <Drawer open onClose={onClose} width="max-w-2xl" title={<span className="flex items-center gap-2"><Avatar name={member.name} size={28} />{member.name}</span>}
      footer={tab === 'roles' ? <>{canRemove && <Button variant="ghost" icon={<UserX />} onClick={onDeactivate} className="mr-auto text-bad">Deactivate</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button>{canEdit && <Button onClick={save} loading={saving} disabled={scope.kind !== 'tenant' && !scope.id} icon={<ShieldCheck />}>Save access</Button>}</> : undefined}>
      <div className="mb-4 flex gap-1 rounded-md bg-sunken p-0.5" role="tablist">
        {(['roles', 'effective'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cx('flex-1 rounded-[5px] py-1.5 text-[13px] font-medium', tab === t ? 'bg-surface text-ink shadow-xs' : 'text-muted')}>{t === 'roles' ? 'Roles & scope' : 'Effective access'}</button>)}
      </div>
      {error && <Alert tone="bad" className="mb-4">{error}</Alert>}
      {tab === 'roles' ? (
        <div className="space-y-5">
          {!canEdit && <Alert tone="info">You can view this person’s roles but not change them.</Alert>}
          <RolePicker roles={roles} selected={selected} onToggle={(k) => canEdit && setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
          <ScopePicker kind={scope.kind} id={scope.id} tree={tree} onChange={(kind, id) => setScope({ kind, id })} />
          <div><p className="mb-2 text-[13px] font-medium text-ink-2">Permission preview</p><CanCannot rows={preview} /></div>
        </div>
      ) : eff ? <EffectiveAccessList rows={eff} emptyText="This person has no permissions." /> : <p className="text-sm text-muted">Loading…</p>}
    </Drawer>
  );
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Enter the person’s name'),
  phone: z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
});
type InviteForm = z.infer<typeof inviteSchema>;

function InviteModal({ open, onClose, roles, tree, onDone }: { open: boolean; onClose: () => void; roles: RoleRow[]; tree: Tree | null; onDone: (name: string) => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>({ resolver: zodResolver(inviteSchema) });
  const [selected, setSelected] = useState(new Set<string>());
  const [scope, setScope] = useState<{ kind: ScopeKind; id: string }>({ kind: 'tenant', id: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { reset({ name: '', phone: '' }); setSelected(new Set()); setScope({ kind: 'tenant', id: '' }); setError(''); } }, [open, reset]);
  const submit = handleSubmit(async (v) => {
    setError('');
    if (!selected.size) { setError('Choose at least one role.'); return; }
    const phone = v.phone.startsWith('+91') ? v.phone : `+91${v.phone}`;
    try { await call('/org/members', { body: { name: v.name, phone, kind: 'staff', roleKeys: [...selected], scopeKind: scope.kind, scopeId: scope.id || undefined } }); onDone(v.name); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not invite'); }
  });
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Invite a staff member" description="They sign in with this phone number (OTP). You can change their roles any time."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={isSubmitting} icon={<UserPlus />}>Send invite</Button></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Full name" required {...register('name')} error={errors.name?.message} autoComplete="off" />
          <Input label="Mobile number" required inputMode="tel" placeholder="98765 43210" {...register('phone')} error={errors.phone?.message} />
        </div>
        <RolePicker roles={roles} selected={selected} onToggle={(k) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
        <ScopePicker kind={scope.kind} id={scope.id} tree={tree} onChange={(kind, id) => setScope({ kind, id })} />
        {error && <Alert tone="bad">{error}</Alert>}
        <Badge tone="neutral">Every invite and role change is recorded in the audit log.</Badge>
      </form>
    </Modal>
  );
}
