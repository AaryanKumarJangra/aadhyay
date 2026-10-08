import { api } from '@/lib/server-api';
import { Card, PageHeader } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { NoticeComposer } from './composer';
export default async function Notices() {
  const [notices, tree] = await Promise.all([api('/comms/notices'), api('/academics/tree')]);
  return (
    <>
      <PageHeader title="Notices & circulars" sub="Sent free in the app. Each parent gets it once, even with several children." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Sent"><ul className="divide-y divide-line">{notices.map((n: any) => <li key={n.id} className="py-3"><p className="font-medium">{n.title}</p><p className="line-clamp-2 text-sm text-muted">{n.body}</p><p className="mt-1 text-xs text-muted">{dateTime(n.publishAt)} · {n.status}</p></li>)}</ul></Card>
        <NoticeComposer tree={tree} />
      </div>
    </>
  );
}
