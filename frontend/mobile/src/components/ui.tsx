import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { RADIUS, SPACE, useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof Feather>['name'];
export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Feather name={name} size={size} color={color ?? t.text2} />;
}

/** Page container: large title, optional subtitle and header action, pull-to-refresh. */
export function Screen({ children, title, subtitle, action, scroll = true, onRefresh, padded = true }: {
  children: ReactNode; title?: string; subtitle?: string; action?: ReactNode; scroll?: boolean; onRefresh?: () => Promise<unknown>; padded?: boolean;
}) {
  const t = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const head = (title || action) ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.md, marginBottom: SPACE.xs }}>
      <View style={{ flex: 1 }}>
        {title && <Text accessibilityRole="header" style={[s.h1, { color: t.text }]}>{title}</Text>}
        {subtitle && <Text style={{ color: t.muted, fontSize: 14, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  ) : null;
  const pad = padded ? { padding: SPACE.lg, gap: SPACE.md } : { gap: SPACE.md };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, { paddingBottom: 32 }]} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }} /> : undefined}>
          {head}{children}
        </ScrollView>
      ) : <View style={[{ flex: 1 }, pad]}>{head}{children}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string }) {
  const t = useTheme();
  const box = <View style={[s.card, { backgroundColor: t.card, borderColor: t.line }, style]}>{children}</View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] })}>{box}</Pressable> : box;
}

export function T({ children, muted, size = 15, bold, semibold, style, numberOfLines }: { children: ReactNode; muted?: boolean; size?: number; bold?: boolean; semibold?: boolean; style?: TextStyle; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ color: muted ? t.muted : t.text, fontSize: size, fontWeight: bold ? '700' : semibold ? '600' : '400' }, style]}>{children}</Text>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, size = 'md' }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'soft'; loading?: boolean; disabled?: boolean; icon?: IconName; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.brand : variant === 'danger' ? t.bad : variant === 'soft' ? t.brandSoft : variant === 'secondary' ? t.card : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'soft' ? t.brand : t.text;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.btn, size === 'sm' && { height: 38, paddingHorizontal: 12 }, { backgroundColor: bg, borderColor: variant === 'secondary' ? t.line : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      {loading ? <ActivityIndicator color={fg} /> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} color={fg} />}<Text style={{ color: fg, fontWeight: '600', fontSize: size === 'sm' ? 14 : 16 }}>{title}</Text></View>}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...p }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text2, fontWeight: '500', fontSize: 14 }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.faint} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...p}
        style={[s.input, { color: t.text, borderColor: error ? t.bad : focus ? t.brand : t.line, backgroundColor: t.card }, p.multiline && { height: 100, paddingTop: 12, textAlignVertical: 'top' }, p.style]} />
      {error ? <Text accessibilityRole="alert" style={{ color: t.bad, fontSize: 13 }}>{error}</Text> : hint ? <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

/** KPI tile: label, value, context line. */
export function Stat({ label, value, sub, tone, icon, onPress }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' | 'warn'; icon?: IconName; onPress?: () => void }) {
  const t = useTheme();
  const color = tone === 'ok' ? t.ok : tone === 'bad' ? t.bad : tone === 'warn' ? t.warn : t.text;
  return (
    <Card style={{ flex: 1, minWidth: 140 }} onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T muted size={13}>{label}</T>{icon && <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={15} color={t.brand} /></View>}
      </View>
      <T size={24} bold style={{ color, marginTop: 2 }}>{value}</T>
      {sub && <T muted size={12}>{sub}</T>}
    </Card>
  );
}

export function Row({ icon, title, subtitle, right, onPress, tone }: { icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; tone?: 'bad' }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: 12, opacity: pressed ? 0.7 : 1 }]}>
      {icon && <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: tone === 'bad' ? t.badSoft : t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={17} color={tone === 'bad' ? t.bad : t.brand} /></View>}
      <View style={{ flex: 1 }}><T semibold numberOfLines={1} style={tone === 'bad' ? { color: t.bad } : undefined}>{title}</T>{subtitle && <T muted size={13} numberOfLines={2}>{subtitle}</T>}</View>
      {right}
      {onPress && !right && <Icon name="chevron-right" size={18} color={t.faint} />}
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'ok' | 'bad' | 'warn' | 'info' | 'neutral' | 'brand'; icon?: IconName }) {
  const t = useTheme();
  const [bg, fg] = tone === 'ok' ? [t.okSoft, t.ok] : tone === 'bad' ? [t.badSoft, t.bad] : tone === 'warn' ? [t.warnSoft, t.warn] : tone === 'info' ? [t.infoSoft, t.info] : tone === 'brand' ? [t.brandSoft, t.brand] : [t.sunken, t.text2];
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>{icon && <Icon name={icon} size={12} color={fg} />}<Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text></View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.sm }}><T bold size={17}>{title}</T>{action}</View>;
}

export function EmptyState({ icon = 'inbox', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: SPACE.xl, gap: 6, borderRadius: RADIUS.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: t.lineStrong, backgroundColor: t.card }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.sunken, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={t.muted} /></View>
      <T semibold style={{ textAlign: 'center' }}>{title}</T>
      {body && <T muted size={14} style={{ textAlign: 'center' }}>{body}</T>}
      {action && <View style={{ marginTop: 8, alignSelf: 'stretch' }}>{action}</View>}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="alert" style={{ padding: SPACE.lg, gap: 8, borderRadius: RADIUS.lg, backgroundColor: t.badSoft, borderWidth: 1, borderColor: '#F7C9C9' }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="alert-circle" color={t.bad} /><T semibold style={{ color: t.bad }}>Couldn’t load this</T></View>
      <T size={14}>{message}</T>
      {onRetry && <Button title="Try again" variant="secondary" size="sm" icon="refresh-cw" onPress={onRetry} />}
    </View>
  );
}

/** Pulsing placeholder blocks while data loads. */
export function Skeleton({ height = 80, style }: { height?: number; style?: ViewStyle }) {
  const t = useTheme();
  const [on, setOn] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { timer.current = setInterval(() => setOn((x) => !x), 700); return () => { if (timer.current) clearInterval(timer.current); }; }, []);
  return <View accessibilityLabel="Loading" style={[{ height, borderRadius: RADIUS.lg, backgroundColor: on ? t.sunken : '#E9ECF3' }, style]} />;
}

export function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? t.brand : t.card, borderWidth: 1, borderColor: on ? t.brand : t.line }}>
      {icon && <Icon name={icon} size={14} color={on ? '#fff' : t.text2} />}
      <Text style={{ color: on ? '#fff' : t.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Offline / sync state banner (attendance, trip events). Never hides unsent work. */
export function SyncBanner({ pending, failed, syncing, onRetry }: { pending: number; failed: number; syncing?: boolean; onRetry: () => void }) {
  const t = useTheme();
  if (!pending && !failed) return null;
  const bad = failed > 0;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: RADIUS.md, backgroundColor: bad ? t.badSoft : t.warnSoft }}>
      <Icon name={bad ? 'alert-triangle' : syncing ? 'refresh-cw' : 'cloud-off'} color={bad ? t.bad : t.warn} />
      <View style={{ flex: 1 }}>
        <T semibold size={14} style={{ color: bad ? t.bad : t.warn }}>{bad ? `${failed} not sent — needs attention` : syncing ? 'Syncing…' : `${pending} waiting to sync`}</T>
        <T size={13}>{bad ? 'The server refused these. Open to see why.' : 'Saved on this phone. Sent automatically when you’re online.'}</T>
      </View>
      <Button title="Retry" size="sm" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.lg, padding: SPACE.lg, gap: 6, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  btn: { height: 50, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, paddingHorizontal: 16 },
  input: { height: 50, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 16 },
});
