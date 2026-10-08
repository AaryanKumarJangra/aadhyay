import { api } from '@/lib/server-api';
import { PageHeader } from '@/components/ui';
import { MarksEntry } from './marks';
export default async function Exam({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const [exam, tree] = await Promise.all([api(`/exams/detail/${examId}`), api('/academics/tree')]);
  return <><PageHeader title={exam.name} sub={exam.publishedAt ? 'Results published' : 'Enter marks, then publish to send results to parents'} /><MarksEntry exam={exam} tree={tree} /></>;
}
