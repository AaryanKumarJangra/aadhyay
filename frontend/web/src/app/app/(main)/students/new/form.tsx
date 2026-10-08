'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select } from '@/components/ui';
import { call } from '@/lib/client';

export function AdmissionForm({ tree }: { tree: any[] }) {
  const router = useRouter();
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr('');
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const guardians = [['father', f.fatherName, f.fatherPhone], ['mother', f.motherName, f.motherPhone]].filter(([, , p]) => p).map(([relation, name, phone], i) => ({ name: name || relation, phone, relation, isPrimary: i === 0, receivesNotifications: true }));
    try {
      const s = await call('/people/students', { body: { name: f.name, dob: f.dob || undefined, gender: f.gender || undefined, category: f.category || undefined, bloodGroup: f.bloodGroup || undefined, address: f.address || undefined, sectionId: f.sectionId || undefined, admissionNo: f.admissionNo || undefined, guardians } });
      router.push(`/app/students/${s.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <Card title="Student">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="name" label="Full name" required className="sm:col-span-2" />
          <Input name="dob" type="date" label="Date of birth" />
          <Select name="gender" label="Gender" options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
          <Select name="sectionId" label="Class & section" options={[{ value: '', label: 'Assign later' }, ...tree.flatMap((c: any) => c.sections.map((s: any) => ({ value: s.id, label: `${c.name}-${s.name}` })))]} />
          <Input name="admissionNo" label="Admission no." hint="Auto-generated if blank" />
          <Select name="category" label="Category" options={['', 'general', 'obc', 'sc', 'st', 'ews'].map((v) => ({ value: v, label: v ? v.toUpperCase() : '—' }))} />
          <Input name="bloodGroup" label="Blood group" />
          <Input name="address" label="Address" className="sm:col-span-2" />
        </div>
      </Card>
      <Card title="Parents / guardians">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="fatherName" label="Father’s name" /><Input name="fatherPhone" label="Father’s mobile" inputMode="tel" />
          <Input name="motherName" label="Mother’s name" /><Input name="motherPhone" label="Mother’s mobile" inputMode="tel" />
        </div>
        {err && <p className="mt-4 text-sm text-bad">{err}</p>}
        <Button type="submit" className="mt-6 w-full" disabled={busy}>{busy ? 'Saving…' : 'Save admission'}</Button>
      </Card>
    </form>
  );
}
