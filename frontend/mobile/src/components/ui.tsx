import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import type { ReactNode } from 'react';

export function Screen({ children, scroll = true, title }: { children: ReactNode; scroll?: boolean; title?: string }) {
  const t = useTheme();
  const body = <>{title && <Text style={[s.h1, { color: t.text }]}>{title}</Text>}{children}</>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>{scroll ? <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>{body}</ScrollView> : <View style={{ flex: 1, padding: 16, gap: 12 }}>{body}</View>}</SafeAreaView>;
}
export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useTheme();
  const box = <View style={[s.card, { backgroundColor: t.card, borderColor: t.line }, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>{box}</Pressable> : box;
}
export function Button({ title, onPress, variant = 'primary', loading, disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.brand : variant === 'danger' ? t.bad : 'transparent';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: variant === 'secondary' ? t.line : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: variant === 'secondary' ? t.text : '#fff', fontWeight: '600', fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}
export function Field({ label, ...p }: TextInputProps & { label: string }) {
  const t = useTheme();
  return <View style={{ gap: 6 }}><Text style={{ color: t.text, fontWeight: '500' }}>{label}</Text><TextInput placeholderTextColor={t.muted} {...p} style={[s.input, { color: t.text, borderColor: t.line, backgroundColor: t.card }]} /></View>;
}
export function T({ children, muted, size = 15, bold, style }: { children: ReactNode; muted?: boolean; size?: number; bold?: boolean; style?: any }) {
  const t = useTheme();
  return <Text style={[{ color: muted ? t.muted : t.text, fontSize: size, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}
export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  const t = useTheme();
  return <Card style={{ flex: 1 }}><T muted size={12}>{label}</T><T size={22} bold style={{ color: tone === 'ok' ? t.ok : tone === 'bad' ? t.bad : t.text, marginTop: 4 }}>{value}</T></Card>;
}
const s = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 6 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, paddingHorizontal: 16 },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
});
