import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { PermissionKey } from '@aadhyay/contracts';
import { Card, EmptyState, ErrorState, Icon, Row, Screen, SectionTitle, Skeleton, T, type IconName } from '@/components/ui';
import { api } from '@/lib/api';
import { can, personaOf, useMe } from '@/lib/access';
import { useTheme } from '@/lib/theme';
import DriverTrip from '../driver/index';

type Tool = { key: string; title: string; subtitle: string; icon: IconName; href: string; anyOf: PermissionKey[] };
/** Only screens that exist in the app; each is shown only when the role can use it. */
const TOOLS: Tool[] = [
  { key: 'attendance', title: 'Mark attendance', subtitle: 'Your classes, works offline', icon: 'check-square', href: '/teacher/attendance', anyOf: ['attendance.student.create'] },
  { key: 'homework', title: 'Assign homework', subtitle: 'Parents are notified in the app', icon: 'book-open', href: '/teacher/homework', anyOf: ['homework.assignment.create'] },
  { key: 'leave', title: 'Apply for leave', subtitle: 'Your own leave request', icon: 'calendar', href: '/leave', anyOf: ['attendance.leave.create'] },
  { key: 'bus', title: 'Live buses', subtitle: 'Running trips on the map', icon: 'map', href: '/parent/bus', anyOf: ['transport.trip.manage'] },
];

export default function Work() {
  const me = useMe();
  const p = personaOf(me);
  if (p === 'driver') return <DriverTrip />;
  if (p === 'family' || p === 'student') return <Children student={p === 'student'} />;
  const tools = TOOLS.filter((x) => x.anyOf.some((k) => can(me, k)));
  return (
    <Screen title="Work" subtitle={me?.roles.map((r) => r.name).join(' · ')}>
      {tools.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{tools.map((x) => <Tile key={x.key} tool={x} />)}</View>
        : <EmptyState icon="grid" title="No mobile tools for your role yet" body="Your role’s modules are available in the web console at app.aadhyay.com." />}
      <Card><Row icon="monitor" title="Full console on the web" subtitle="Reports, settings, fees desk and every module your role includes." /></Card>
    </Screen>
  );
}
function Tile({ tool }: { tool: Tool }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tool.title} onPress={() => router.push(tool.href as never)} style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ minHeight: 120 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={tool.icon} color={t.brand} size={20} /></View>
        <T semibold style={{ marginTop: 6 }}>{tool.title}</T>
        <T muted size={13}>{tool.subtitle}</T>
      </Card>
    </Pressable>
  );
}

function Children({ student }: { student: boolean }) {
  const [kids, setKids] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => { setErr(''); try { setKids((await api('/dashboards/family')).children); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Screen title={student ? 'My school' : 'Children'} onRefresh={load}>
      {err ? <ErrorState message={err} onRetry={load} /> : kids === null ? <Skeleton height={140} /> : !kids.length ? <EmptyState icon="user-x" title="No student linked yet" body="Ask the school office to link your mobile number." /> : kids.map((k) => (
        <Card key={k.id}>
          <Row icon="user" title={student ? k.name : k.name} subtitle={k.className ? `${k.className} – ${k.sectionName}` : undefined} onPress={() => router.push(`/child/${k.id}`)} />
          <SectionTitle title="Quick actions" />
          <Row icon="check-square" title="Attendance" subtitle={k.attendance30.pct === null ? 'No records yet' : `${k.attendance30.pct}% in the last 30 days`} onPress={() => router.push(`/child/${k.id}?tab=attendance`)} />
          <Row icon="book-open" title="Homework" subtitle={`${k.homeworkOpen} open`} onPress={() => router.push(`/child/${k.id}?tab=homework`)} />
          <Row icon="award" title="Results" subtitle={k.lastResult ? `${k.lastResult.exam}: ${k.lastResult.percentage}%` : 'No published results'} onPress={() => router.push(`/child/${k.id}?tab=results`)} />
          <Row icon="credit-card" title="Fees" subtitle={k.fees.duePaise ? 'Pay online by UPI, card or net banking' : 'Nothing due'} onPress={() => router.push(`/child/${k.id}?tab=fees`)} />
          {!student && <Row icon="calendar" title="Apply for leave" onPress={() => router.push({ pathname: '/leave', params: { studentId: k.id, name: k.name } })} />}
          <Row icon="truck" title="School bus" subtitle={k.bus ? 'On the way now' : 'Not running right now'} onPress={() => router.push('/parent/bus')} />
        </Card>
      ))}
    </Screen>
  );
}
