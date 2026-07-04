import { Ionicons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollArrowHint } from '@/components/scroll-arrow-hint';
import { SwipeHint } from '@/components/swipe-hint';
import { AccountMenu } from '@/components/AccountMenu';
import WhatsNewModal from '@/components/WhatsNewModal';
import OnboardingTour from '@/components/OnboardingTour';
import ThemeBackdrop from '@/components/ThemeBackdrop';
import { useTheme } from '@/lib/theme';

// Onglets "material top tabs" → permettent le swipe gauche/droite,
// mais positionnés en bas (tabBarPosition="bottom") pour garder le look actuel.
const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

const ICON = 22;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <ThemeBackdrop />
    <MaterialTopTabs
      tabBarPosition="bottom"
      screenOptions={{
        sceneStyle: { backgroundColor: 'transparent' },
        swipeEnabled: true,
        lazy: true,
        tabBarScrollEnabled: true,
        tabBarActiveTintColor: C.petrol,
        tabBarInactiveTintColor: C.muted,
        tabBarShowIcon: true,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', textTransform: 'none', marginTop: 2 },
        tabBarItemStyle: { width: 86, paddingVertical: 6, paddingHorizontal: 0 },
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.line,
          borderTopWidth: 1,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIndicatorStyle: { backgroundColor: C.petrol, height: 3, top: 0 },
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
    <AccountMenu />
    <WhatsNewModal />
    <OnboardingTour />
    </View>
  );
}
