import { api } from '@/lib/server-api';
import { PageHeader } from '@/components/ui';
import { AdmissionForm } from './form';
export default async function NewStudent() {
  const tree = await api('/academics/tree');
  return <><PageHeader title="New admission" sub="Parents get the app login automatically on their mobile. Siblings link by parent phone." /><AdmissionForm tree={tree} /></>;
}
