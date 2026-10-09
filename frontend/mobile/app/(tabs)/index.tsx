import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Row, Screen, SectionTitle, Skeleton, Stat, T } from '@/components/ui';
import { api } from '@/lib/api';
import { personaOf, useMe, type Persona } from '@/lib/access';
import { inrShort, shortDate, today, useTheme } from '@/lib/theme';

const greet = () => { const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date())); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const ENDPOINT: Partial<Record<Persona, string>> = { admin: '/dashboards/institution?range=7', finance: '/dashboards/finance?range=7', teacher: '/dashboards/teacher', family: '/dashboards/family', student: '/dashboards/family' };

/** Home: what matters today for this person — computed by the API from their permissions and scope. */
export default function Home() {
  const me = useMe();
  const p = personaOf(me);
  const [d, setD] = useState<any>(null);
  const [extra, setExtra] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try {
      const url = ENDPOINT[p];
      if (url) setD(await api(url));
      if (p === 'teacher') setExtra(await api('/timetable/my').catch(() => []));
      if (p === 'driver') setExtra(await api('/transport/my/vehicles'));
      if (!url && p !== 'driver') setD({});
    } catch (e: any) { setErr(e.message); }
  }, [p]);
  useEffect(() => { void load(); }, [load]);
  const name = me?.user?.name?.split(' ')[0] ?? '';
  return (
    <Screen title={`${greet()}${name ? `, ${name}` : ''}`} subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })} onRefresh={load}>
      {err ? <ErrorState message={err} onRetry={load} /> : !d && p !== 'driver' ? <><Skeleton height={110} /><Skeleton height={110} /><Skeleton height={180} /></>
        : p === 'admin' ? <AdminHome d={d} /> : p === 'finance' ? <FinanceHome d={d} /> : p === 'teacher' ? <TeacherHome d={d} tt={extra ?? []} />
        : p === 'family' || p === 'student' ? <FamilyHome d={d} student={p === 'student'} /> : p === 'driver' ? <DriverHome s={extra} /> : <StaffHome />}
    </Screen>
  );
}

function AdminHome({ d }: { d: any }) {
  const a = d.attendance, f = d.fees;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="Students" icon="users" value={d.people.students.toLocaleString('en-IN')} sub={`${d.people.staff} staff`} />
        {a && <Stat label="Attendance today" icon="check-square" value={a.today.pct === null ? '—' : `${a.today.pct}%`} sub={`${a.today.sectionsMarked}/${a.today.sectionsTotal} sections marked`} tone={a.today.pct !== null && a.today.pct < 85 ? 'warn' : undefined} />}
        {f && <Stat label="Collected (month)" icon="credit-card" value={inrShort(f.monthPaise)} sub={`${f.collectionPct ?? 0}% of billed`} tone="ok" />}
        {f && <Stat label="Overdue" icon="alert-triangle" value={inrShort(f.overduePaise)} sub={`${f.overdueStudents} students`} tone={f.overduePaise ? 'bad' : undefined} />}
      </View>
      <SectionTitle title="Needs attention" />
      {d.alerts.length ? <Card>{d.alerts.map((x: any, i: number) => <Row key={i} icon={x.tone === 'bad' ? 'alert-octagon' : x.tone === 'warn' ? 'alert-triangle' : 'info'} tone={x.tone === 'bad' ? 'bad' : undefined} title={x.title} subtitle={x.detail} />)}</Card> : <EmptyState icon="check-circle" title="All clear" body="Nothing needs your attention right now." />}
    </>
  );
}

function FinanceHome({ d }: { d: any }) {
  const f = d.fees;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="Today" icon="credit-card" value={inrShort(f.todayPaise)} sub={`${f.receiptsToday} receipts`} tone="ok" />
        <Stat label="This month" icon="trending-up" value={inrShort(f.monthPaise)} />
        <Stat label="Outstanding" icon="file-text" value={inrShort(f.outstandingPaise)} sub={`${f.collectionPct ?? 0}% collected`} />
        <Stat label="Overdue" icon="alert-triangle" value={inrShort(f.overduePaise)} tone={f.overduePaise ? 'bad' : undefined} />
      </View>
      <SectionTitle title="Recent receipts" />
      <Card>{d.recentReceipts.length ? d.recentReceipts.slice(0, 6).map((r: any) => <Row key={r.id} icon="file-text" title={r.student} subtitle={`${r.number} · ${r.mode.toUpperCase()}`} right={<T semibold>{inrShort(r.paise)}</T>} />) : <T muted>No receipts yet.</T>}</Card>
    </>
  );
}

function TeacherHome({ d, tt }: { d: any; tt: any[] }) {
  const pending = d.sections.filter((s: any) => !s.markedToday);
  const weekday = ((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const todays = tt.filter((s) => s.weekday === weekday);
  return (
    <>
      {pending.length > 0 && (
        <Card style={{ backgroundColor: '#FDF4E3', borderColor: '#F3D9A4' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="clock" color="#B45309" /><T semibold style={{ color: '#B45309' }}>Attendance pending for {pending.length} {pending.length === 1 ? 'class' : 'classes'}</T></View>
          <T size={14}>{pending.map((s: any) => s.name).join(', ')}</T>
          <Button title="Mark attendance" icon="check-square" onPress={() => router.push({ pathname: '/teacher/attendance', params: { sectionId: pending[0].id } })} />
        </Card>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="My classes" icon="users" value={String(d.sections.length)} sub={`${d.sections.length - pending.length} marked today`} />
        <Stat label="To evaluate" icon="edit-3" value={String(d.homework.toEvaluate)} sub={`${d.homework.dueSoon} homework due soon`} tone={d.homework.toEvaluate ? 'warn' : undefined} />
      </View>
      <SectionTitle title="Today’s timetable" />
      {todays.length ? <Card>{todays.map((s: any, i: number) => <Row key={s.id} icon="clock" title={`${s.className}-${s.section} · ${s.subject}`} subtitle={`Period ${i + 1}${s.room ? ` · Room ${s.room}` : ''}`} />)}</Card> : <EmptyState icon="calendar" title="No periods today" body="Your timetable appears here once it is published." />}
      <SectionTitle title="My classes" />
      <Card>{d.sections.map((s: any) => <Row key={s.id} icon="users" title={s.name} subtitle={`${s.strength} students${s.isClassTeacher ? ' · Class teacher' : ''}`} right={s.markedToday ? <Badge tone="ok" icon="check" label={`${s.presentPct}%`} /> : <Badge tone="warn" label="Not marked" />} onPress={() => router.push({ pathname: '/teacher/attendance', params: { sectionId: s.id } })} />)}</Card>
    </>
  );
}

function FamilyHome({ d, student }: { d: any; student: boolean }) {
  const t = useTheme();
  if (!d.children.length) return <EmptyState icon="user-x" title="No student linked yet" body="Ask the school office to link your mobile number to the admission record." />;
  return (
    <>
      {d.children.map((k: any) => (
        <Card key={k.id} onPress={() => router.push(`/child/${k.id}`)} accessibilityLabel={`${k.name} details`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><T bold style={{ color: t.brand }}>{k.name[0]}</T></View>
            <View style={{ flex: 1 }}><T bold size={17}>{student ? 'My day' : k.name}</T><T muted size={13}>{k.className ? `${k.className} – ${k.sectionName}` : 'Not in a class yet'}</T></View>
            {k.todayStatus ? <Badge tone={k.todayStatus === 'absent' ? 'bad' : k.todayStatus === 'present' ? 'ok' : 'warn'} label={k.todayStatus === 'present' ? 'Present today' : k.todayStatus === 'absent' ? 'Absent today' : k.todayStatus} /> : <Badge label="Not marked" />}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            <Mini label="Attendance" value={k.attendance30.pct === null ? '—' : `${k.attendance30.pct}%`} />
            <Mini label="Fees due" value={inrShort(k.fees.duePaise)} bad={k.fees.overduePaise > 0} />
            <Mini label="Homework" value={`${k.homeworkOpen} open`} />
            <Mini label="Last result" value={k.lastResult ? `${k.lastResult.percentage}%` : '—'} />
          </View>
          {k.fees.overduePaise > 0 && <T size={13} style={{ color: t.bad, marginTop: 6 }}>{inrShort(k.fees.overduePaise)} overdue{k.fees.nextDue ? ` · next due ${shortDate(k.fees.nextDue)}` : ''}</T>}
          {k.bus && <Row icon="truck" title="School bus is on the way" subtitle="Tap to track live" onPress={() => router.push('/parent/bus')} />}
        </Card>
      ))}
    </>
  );
}
function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  const t = useTheme();
  return <View style={{ flexBasis: '46%', flexGrow: 1, backgroundColor: t.sunken, borderRadius: 10, padding: 10 }}><T muted size={12}>{label}</T><T semibold size={16} style={bad ? { color: t.bad } : undefined}>{value}</T></View>;
}

function DriverHome({ s }: { s: any }) {
  if (!s) return <Skeleton height={160} />;
  const trip = s.runningTrip;
  return (
    <>
      <Card>
        <T muted size={13}>{trip ? 'Trip running' : 'No trip running'}</T>
        <T bold size={20}>{s.vehicles.length ? s.vehicles.map((v: any) => v.name ?? v.regNo).join(', ') : 'No vehicle assigned'}</T>
        <T muted size={14}>{s.routes.length} {s.routes.length === 1 ? 'route' : 'routes'} on your vehicle</T>
        <Button title={trip ? 'Open trip' : 'Start a trip'} icon="navigation" onPress={() => router.push('/(tabs)/work')} disabled={!s.vehicles.length} />
      </Card>
      {!s.vehicles.length && <EmptyState icon="truck" title="You aren’t assigned to a vehicle" body="Ask the transport manager to assign you as driver or attendant." />}
    </>
  );
}

function StaffHome() {
  return <EmptyState icon="grid" title="Your tools are in Work" body="Open the Work tab for the modules your role includes." action={<Button title="Open Work" onPress={() => router.push('/(tabs)/work')} />} />;
}
