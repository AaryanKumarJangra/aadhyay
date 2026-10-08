import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTheme } from '@/lib/theme';
export default function TeacherTabs() {
  const t = useTheme();
  const I = (g: string) => () => <Text style={{ fontSize: 20 }}>{g}</Text>;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.brand }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: I('📅') }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: I('✅') }} />
      <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: I('📚') }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: I('💬') }} />
    </Tabs>
  );
}
