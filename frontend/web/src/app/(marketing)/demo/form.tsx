'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
export function DemoForm() {
  const [ok, setOk] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const r = await fetch('/api/v1/public/demo-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, students: f.students ? Number(f.students) : undefined }) });
    setOk(r.ok);
  }
  return ok ? <p className="mt-6 rounded-lg bg-ok/10 p-4">Thanks! We’ll call you within one working day.</p> : (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <Input name="name" label="Your name" required /><Input name="phone" label="Mobile" required /><Input name="institution" label="School / institute" /><Input name="city" label="City" /><Input name="students" label="Students" type="number" />
      <Button type="submit">Request demo</Button>
    </form>
  );
}
