import { api } from '@/lib/server-api';
import { PageHeader } from '@/components/ui';
import { AttendanceMarker } from './marker';
export default async function Attendance() {
  const tree = await api('/academics/tree');
  return <><PageHeader title="Attendance" sub="Everyone is present by default — tap only the absentees. Parents of absent children are alerted instantly." /><AttendanceMarker tree={tree} /></>;
}
