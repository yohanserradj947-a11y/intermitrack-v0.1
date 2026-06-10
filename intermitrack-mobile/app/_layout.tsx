import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, opacity: color === '#1F4E5F' ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: '#FFFFFF',
        borderTopColor: '#E2E8F0',
        borderTopWidth: 1,
        height: 60,
        paddingBottom: 8,
        paddingTop: 6,
      },
      tabBarActiveTintColor: '#1F4E5F',
      tabBarInactiveTintColor: '#718096',
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color}/> }}/>
      <Tabs.Screen name="missions" options={{ title: 'Missions', tabBarIcon: ({ color }) => <TabIcon emoji="🎬" color={color}/> }}/>
      <Tabs.Screen name="calendar" options={{ title: 'Calendrier', tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color}/> }}/>
      <Tabs.Screen name="actualisation" options={{ title: 'Actualisation', tabBarIcon: ({ color }) => <TabIcon emoji="✅" color={color}/> }}/>
      <Tabs.Screen name="previsions" options={{ title: 'Prévisions', tabBarIcon: ({ color }) => <TabIcon emoji="📈" color={color}/> }}/>
    </Tabs>
  );
}