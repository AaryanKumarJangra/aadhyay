import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Icon, Row, Screen, Skeleton, T } from '@/components/ui';
import { api } from '@/lib/api';
import { inr, shortDate, today, useTheme } from '@/lib/theme';

type Tab = 'attendance' | 'homework' | 'results' | 'fees';
const STATUS: Record<string, { bg: string; fg: string; letter: string; label: string }> = {
  present: { bg: '#E6F6F4', fg: '#0D9488', letter: 'P', label: 'Present' }, late: { bg: '#FDF4E3', fg: '#B45309', letter: 'L', label: 'Late' },
  half_day: { bg: '#FDF4E3', fg: '#B45309', letter: 'H', label: 'Half day' }, absent: { bg: '#FDECEC', fg: '#DC2626', letter: 'A', label: 'Absent' },
  leave: { bg: '#E8F0FE', fg: '#2563EB', letter: 'LV', label: 'Leave' }, holiday: { bg: '#F1F3F8', fg: '#64748B', letter: 'Ho', label: 'Holiday' },
};

/** One child (or the student themself): attendance calendar, homework, results, fees with Pay. Opened from alerts too. */
export default function Child() {
  const t = useTheme();
  const { id, tab: initial } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(initial ?? 'attendance');
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/people/students/${id}`).then(setS).catch((e) => setErr(e.message)); }, [id]);
  return (
    <Screen title={s?.name ?? 'Student'} subtitle={s?.current ? `${s.current.className}-${s.current.sectionName}` : undefined} action={<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ padding: 8 }}><Icon name="x" size={22} /></Pressable>}>
      {err ? <ErrorState message={err} /> : !s ? <Skeleton height={200} /> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(['attendance', 'homework', 'results', 'fees'] as const).filter((x) => x !== 'fees' || s.visibility?.fees).map((x) => <Chip key={x} on={tab === x} label={x[0]!.toUpperCase() + x.slice(1)} onPress={() => setTab(x)} />)}
          </ScrollView>
          {tab === 'attendance' && <Attendance id={id} />}
          {tab === 'homework' && <Homework sectionId={s.current?.sectionId} />}
          {tab === 'results' && <Results id={id} />}
          {tab === 'fees' && <Fees id={id} />}
        </>
      )}
    </Screen>
  );
}

function Attendance({ id }: { id: string }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(() => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    setRows(null);
    api(`/attendance/students/${id}?from=${month}-01&to=${end < today() ? end : today()}`).then(setRows).catch(() => setRows([]));
  }, [id, month]);
  useEffect(load, [load]);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const by = new Map((rows ?? []).map((r) => [r.date, r.status]));
  const working = (rows ?? []).filter((r) => r.status !== 'holiday').length;
  const present = (rows ?? []).filter((r) => ['present', 'late', 'half_day'].includes(r.status)).length;
  const shift = (d: number) => { const x = new Date(Date.UTC(y, m - 1 + d, 1)); setMonth(x.toISOString().slice(0, 7)); };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel="Previous month" onPress={() => shift(-1)} style={{ padding: 6 }}><Icon name="chevron-left" /></Pressable>
        <T semibold>{new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</T>
        <Pressable accessibilityLabel="Next month" disabled={month >= today().slice(0, 7)} onPress={() => shift(1)} style={{ padding: 6, opacity: month >= today().slice(0, 7) ? 0.3 : 1 }}><Icon name="chevron-right" /></Pressable>
      </View>
      <T muted size={13} style={{ textAlign: 'center' }}>{working ? `${Math.round((present / working) * 1000) / 10}% present · ${present} of ${working} days` : 'No attendance marked this month'}</T>
      {rows === null ? <Skeleton height={220} /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <View key={i} style={{ width: '14.28%', alignItems: 'center', paddingBottom: 4 }}><T muted size={11}>{d}</T></View>)}
          {Array.from({ length: lead }, (_, i) => <View key={`l${i}`} style={{ width: '14.28%', height: 44 }} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`;
            const st = STATUS[by.get(date) ?? ''];
            return (
              <View key={date} style={{ width: '14.28%', padding: 2 }} accessibilityLabel={`${date}: ${st?.label ?? 'not marked'}`}>
                <View style={{ height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: st?.bg ?? '#F9FAFC', borderWidth: date === today() ? 2 : 0, borderColor: '#2563EB' }}>
                  <T size={12} semibold style={{ color: st?.fg ?? '#94A3B8' }}>{i + 1}</T>{st && <T size={9} bold style={{ color: st.fg }}>{st.letter}</T>}
                </View>
              </View>
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{Object.values(STATUS).map((x) => <Badge key={x.letter} label={`${x.letter} ${x.label}`} />)}</View>
    </Card>
  );
}

function Homework({ sectionId }: { sectionId?: string }) {
  const [hw, setHw] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (sectionId) api(`/homework/sections/${sectionId}`).then(setHw).catch((e) => setErr(e.message)); }, [sectionId]);
  if (!sectionId) return <EmptyState title="Not in a class this year" />;
  if (err) return <ErrorState message={err} />;
  if (!hw) return <Skeleton height={160} />;
  if (!hw.length) return <EmptyState icon="book-open" title="No homework yet" />;
  return <Card>{hw.map((h) => <Row key={h.id} icon="book-open" title={h.title} subtitle={`${h.subject ?? 'General'} · due ${shortDate(h.dueOn)}`} right={h.dueOn >= today() ? <Badge tone="warn" label="Open" /> : <Badge label="Closed" />} />)}</Card>;
}

function Results({ id }: { id: string }) {
  const [r, setR] = useState<any[] | null>(null);
  useEffect(() => { api(`/exams/students/${id}/results`).then(setR).catch(() => setR([])); }, [id]);
  if (!r) return <Skeleton height={140} />;
  if (!r.length) return <EmptyState icon="award" title="No published results yet" body="You’ll get an alert when results are published." />;
  return <Card>{r.map((x) => <Row key={x.examId} icon="award" title={x.exam} subtitle={`Grade ${x.grade ?? '—'}${x.rank ? ` · Rank ${x.rank}` : ''}`} right={<T bold>{x.percentage}%</T>} />)}</Card>;
}

function Fees({ id }: { id: string }) {
  const t = useTheme();
  const [l, setL] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/fees/students/${id}/ledger`).then(setL).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <ErrorState message={err} />;
  if (!l) return <Skeleton height={160} />;
  const due = l.totals.outstandingPaise;
  return (
    <>
      <Card>
        <T muted size={13}>Outstanding</T>
        <T bold size={28} style={{ color: l.totals.overduePaise ? t.bad : t.text }}>{inr(due)}</T>
        {l.totals.overduePaise > 0 && <T size={13} style={{ color: t.bad }}>{inr(l.totals.overduePaise)} overdue</T>}
        {due > 0 ? <Button title={`Pay ${inr(due)} online`} icon="credit-card" onPress={() => router.push({ pathname: '/pay', params: { studentId: id } })} /> : <Badge tone="ok" icon="check" label="All paid" />}
      </Card>
      <Card>{l.lines.map((x: any) => <Row key={x.id} icon={x.status === 'paid' ? 'check-circle' : 'file-text'} title={x.title} subtitle={`Due ${shortDate(x.dueOn)}`} right={<T semibold style={{ color: x.overdue ? t.bad : t.text }}>{x.status === 'paid' ? 'Paid' : inr(x.outstandingPaise)}</T>} />)}</Card>
    </>
  );
}
