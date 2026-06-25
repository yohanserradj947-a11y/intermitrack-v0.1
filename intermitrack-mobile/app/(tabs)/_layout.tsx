import { Ionicons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollArrowHint } from '@/components/scroll-arrow-hint';
import { SwipeHint } from '@/components/swipe-hint';

// Onglets "material top tabs" → permettent le swipe gauche/droite,
// mais positionnés en bas (tabBarPosition="bottom") pour garder le look actuel.
const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

const ICON = 22;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
    <MaterialTopTabs
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled: true,
        lazy: true,
        tabBarScrollEnabled: true,
        tabBarActiveTintColor: '#1F4E5F',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarShowIcon: true,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', textTransform: 'none', marginTop: 2 },
        tabBarItemStyle: { width: 86, paddingVertical: 6, paddingHorizontal: 0 },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIndicatorStyle: { backgroundColor: '#1F4E5F', height: 3, top: 0 },
      }}
    >
      <MaterialTopTabs.Screen
        name="index"
        options={{ title: 'Tableau', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="grid-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="calendar"
        options={{ title: 'Calendrier', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="calendar-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="missions"
        options={{ title: 'Missions', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="briefcase-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="actualisation"
        options={{ title: 'Actu.', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="checkmark-done-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="previsions"
        options={{ title: 'Prévisions', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="trending-up-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="documents"
        options={{ title: 'Documents', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="document-text-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="autoentrepreneur"
        options={{ title: 'Auto-entr.', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="cash-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="fiscalite"
        options={{ title: 'Fiscalité', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="calculator-outline" size={ICON} color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="contacts"
        options={{ title: 'Contacts', tabBarIcon: ({ color }: { color: string }) => <Ionicons name="call-outline" size={ICON} color={color} /> }}
      />
    </MaterialTopTabs>
    <ScrollArrowHint tabs={['index', 'calendar', 'missions', 'actualisation', 'previsions', 'documents', 'autoentrepreneur', 'fiscalite', 'contacts']} />
    <SwipeHint />
    </View>
  );
}
