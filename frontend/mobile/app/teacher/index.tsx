import { useEffect, useState } from 'react';
import { Screen, Card, T } from '@/components/ui';
import { api } from '@/lib/api';
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export default function TeacherToday() {
  const [tt, setTt] = useState<any[]>([]);
  useEffect(() => { api('/timetable/my').then(setTt).catch(() => undefined); }, []);
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const mine = tt.filter((s) => s.weekday === today);
  return (
    <Screen title={`My day · ${DAYS[today]}`}>
      {mine.length ? mine.map((s) => <Card key={s.id}><T bold>{s.className}-{s.section}</T><T muted>{s.subject}{s.room ? ` · Room ${s.room}` : ''}</T></Card>) : <Card><T muted>No classes scheduled today.</T></Card>}
    </Screen>
  );
}
