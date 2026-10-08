import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/theme';
export default function ParentTabs() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.brand, tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Icon c={color} g="🏠" /> }} />
      <Tabs.Screen name="bus" options={{ title: 'Bus', tabBarIcon: ({ color }) => <Icon c={color} g="🚌" /> }} />
      <Tabs.Screen name="inbox" options={{ title: 'Alerts', tabBarIcon: ({ color }) => <Icon c={color} g="🔔" /> }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: ({ color }) => <Icon c={color} g="💬" /> }} />
    </Tabs>
  );
}
import { Text } from 'react-native';
const Icon = ({ g }: { c: unknown; g: string }) => <Text style={{ fontSize: 20 }}>{g}</Text>;
