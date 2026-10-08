'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { call } from '@/lib/client';
export function NoticeComposer({ tree }: { tree: any[] }) {
  const router = useRouter();
  const [classIds, setClassIds] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [msg, setMsg] = useState('');
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await call('/comms/notices', { body: { title: f.title, body: f.body, audience: classIds.length ? { classIds } : { all: true }, urgent } });
      setMsg('Sent ✓'); (e.target as HTMLFormElement).reset(); router.refresh();
    } catch (err: any) { setMsg(err.message); }
  }
  return (
    <Card title="New notice">
      <form onSubmit={send} className="space-y-3">
        <Input name="title" label="Title" required />
        <Textarea name="body" label="Message" rows={5} required />
        <div><p className="mb-1 text-sm font-medium">Send to</p><div className="flex flex-wrap gap-2">{tree.map((c) => <button type="button" key={c.id} onClick={() => setClassIds((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))} className={`rounded-full border px-3 py-1 text-xs ${classIds.includes(c.id) ? 'border-brand bg-brand text-white' : 'border-line'}`}>{c.name}</button>)}</div><p className="mt-1 text-xs text-muted">{classIds.length ? `${classIds.length} classes` : 'Everyone'}</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Emergency (also WhatsApp + SMS fallback, ignores quiet hours)</label>
        <Button className="w-full">Send notice</Button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </Card>
  );
}
