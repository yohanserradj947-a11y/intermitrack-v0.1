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

// PAS de largeur maximale : l'appli occupe tout l'écran, iPad et Mac compris.
// J'avais borné à 620 puis à 900 pour éviter d'étirer des mises en page pensées pour un téléphone.
// Les deux valeurs laissaient de larges bandes inutiles sur les côtés — vérifié par Yohan sur iPad,
// deux fois. Décision : on remplit, comme l'écran de connexion qui le faisait déjà.
// Si un écran s'étire mal sur grand écran, il faudra le traiter LUI, pas brider toute l'appli.

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <ThemeBackdrop />
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
        // La barre d'onglets défile (8 onglets x 86 pt = 688 pt) : sur un téléphone elle est plus large
        // que l'écran et défile, sur un iPad elle tient largement et restait collée à GAUCHE, laissant
        // un grand vide à droite (retour Yohan). flexGrow permet au contenu d'occuper toute la largeur
        // disponible, justifyContent le centre alors quand il y a de la place — sans rien changer sur
        // téléphone, où le contenu déborde de toute façon.
        tabBarContentContainerStyle: { flexGrow: 1, justifyContent: 'center' },
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
    <SwipeHint />
    <AccountMenu />
    <WhatsNewModal />
    <OnboardingTour />
    </View>
  );
}
