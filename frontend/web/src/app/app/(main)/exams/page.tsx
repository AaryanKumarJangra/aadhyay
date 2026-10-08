import Link from 'next/link';
import { api } from '@/lib/server-api';
import { Card, PageHeader, Badge } from '@/components/ui';
export default async function Exams() {
  const exams = await api('/exams/exams?limit=100');
  return (
    <>
      <PageHeader title="Exams" />
      <Card title="Exams">
        <ul className="divide-y divide-line">{exams.items.map((e: any) => <li key={e.id} className="flex items-center justify-between py-3"><Link href={`/app/exams/${e.id}`} className="font-medium text-brand">{e.name}</Link>{e.publishedAt ? <Badge tone="ok">Published</Badge> : <Badge>Draft</Badge>}</li>)}</ul>
        {!exams.items.length && <p className="text-muted">Create an exam group and exam from the API or settings first.</p>}
      </Card>
    </>
  );
}
