import { Ionicons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator, MaterialTopTabBar } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabDots } from '@/components/tab-dots';
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

// Largeur maximale du contenu. Les mises en page sont pensées pour un téléphone : les étirer sans
// limite sur un grand écran donnerait des cartes démesurées et des lignes de texte qui traversent
// l'écran. On borne donc, et on centre. Aucun effet sur téléphone (toujours plus étroit).
//
// 900 et non 620 : à 620, un iPad affichait de larges bandes de chaque côté (retour Yohan sur
// TestFlight, testé sur un iPad 768 x 1024 pt). À 900, le portrait est rempli entièrement et le
// paysage ne laisse qu'une marge discrète. Valeur réglée sur l'appareil, pas au jugé.
// L'écran de connexion, lui, est hors de ce conteneur et occupe tout l'écran — c'est voulu.
const MAX_W = 900;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <ThemeBackdrop />
    <View style={{ flex: 1, width: '100%', maxWidth: MAX_W, alignSelf: 'center' }}>
    <MaterialTopTabs
      tabBarPosition="bottom"
      tabBar={(props) => (
        <View style={{ backgroundColor: C.card }}>
          <TabDots index={props.state.index} count={props.state.routes.length} />
          <MaterialTopTabBar {...props} />
        </View>
      )}
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
    {/* Dans le conteneur borné : la pastille du compte (position absolue) se cale ainsi sur le bord
        du contenu, et non sur celui de l'écran — sinon elle flotterait seule dans le vide sur iPad. */}
    <SwipeHint />
    <AccountMenu />
    <WhatsNewModal />
    <OnboardingTour />
    </View>
    </View>
  );
}
