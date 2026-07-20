import { Ionicons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator, MaterialTopTabBar } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabDots } from '@/components/tab-dots';
import { SwipeHint } from '@/components/swipe-hint';
import { AccountMenu } from '@/components/AccountMenu';
import ProfileSetupModal from '@/components/ProfileSetupModal';
import OnboardingTour from '@/components/OnboardingTour';
import ThemeBackdrop from '@/components/ThemeBackdrop';
import { useTheme } from '@/lib/theme';
import { PremiumProvider } from '@/lib/premium';

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

// Largeur des onglets quand la barre défile (téléphone). 8 onglets x 86 pt = 688 pt : au-delà de ce
// seuil, tout tient à l'écran et le défilement n'a plus lieu d'être.
const TAB_W = 86;
const TABS_TOTAL = 8 * TAB_W;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const { width } = useWindowDimensions();
  // Sur un grand écran, on COUPE le défilement au lieu de centrer une barre défilante à la main.
  // Ma première tentative centrait le contenu du ScrollView : l'indicateur (le trait sous l'onglet
  // actif) calcule sa position à partir des offsets d'origine et ignorait ce décalage — il atterrissait
  // donc dans le vide. Sans défilement, les onglets se répartissent nativement sur toute la largeur et
  // l'indicateur retombe juste, sans rustine. Retour Yohan (iPad).
  const scrollTabs = width < TABS_TOTAL + 20;
  // Onglet actif nettement visible : pastille pétrole douce derrière l'icône (fiable, pas de calcul
  // d'offset comme l'ancien indicateur qui se décalait). Retour Yohan : on ne savait plus où on était.
  const tabIcon = (name: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={{ backgroundColor: focused ? C.petrol + '22' : 'transparent', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 3 }}>
      <Ionicons name={name} size={ICON} color={color} />
    </View>
  );
  return (
    <PremiumProvider>
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
        tabBarScrollEnabled: scrollTabs,
        tabBarActiveTintColor: C.petrol,
        tabBarInactiveTintColor: C.muted,
        tabBarShowIcon: true,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', textTransform: 'none', marginTop: 2 },
        // Largeur fixe uniquement quand la barre défile. Sans défilement, on laisse les onglets se
        // répartir eux-mêmes sur toute la largeur : une largeur imposée les tasserait à gauche.
        tabBarItemStyle: scrollTabs ? { width: TAB_W, paddingVertical: 6, paddingHorizontal: 0 } : { paddingVertical: 6, paddingHorizontal: 0 },
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.line,
          borderTopWidth: 1,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        // Indicateur SUPPRIMÉ (retour Yohan, iPad) : il n'était jamais au-dessus du bon onglet.
        // Il calcule sa position à partir des offsets de la barre défilante et se décalait dès que
        // celle-ci ne défilait pas de la même façon. Il était de toute façon redondant : les points
        // (TabDots, juste au-dessus) indiquent déjà la page active, et eux sont fiables.
        tabBarIndicatorStyle: { height: 0 },
      }}
    >
      <MaterialTopTabs.Screen
        name="index"
        options={{ title: 'Tableau', tabBarIcon: tabIcon('grid-outline') }}
      />
      <MaterialTopTabs.Screen
        name="calendar"
        options={{ title: 'Calendrier', tabBarIcon: tabIcon('calendar-outline') }}
      />
      <MaterialTopTabs.Screen
        name="missions"
        options={{ title: 'Missions', tabBarIcon: tabIcon('briefcase-outline') }}
      />
      <MaterialTopTabs.Screen
        name="actualisation"
        options={{ title: 'Actu.', tabBarIcon: tabIcon('checkmark-done-outline') }}
      />
      <MaterialTopTabs.Screen
        name="previsions"
        options={{ title: 'Simulation', tabBarIcon: tabIcon('trending-up-outline') }}
      />
      <MaterialTopTabs.Screen
        name="documents"
        options={{ title: 'Documents', tabBarIcon: tabIcon('document-text-outline') }}
      />
      <MaterialTopTabs.Screen
        name="autoentrepreneur"
        options={{ title: 'Auto-entr.', tabBarIcon: tabIcon('cash-outline') }}
      />
      <MaterialTopTabs.Screen
        name="fiscalite"
        options={{ title: 'Fiscalité', tabBarIcon: tabIcon('calculator-outline') }}
      />
      <MaterialTopTabs.Screen
        name="contacts"
        options={{ title: 'Contacts', tabBarIcon: tabIcon('call-outline') }}
      />
    </MaterialTopTabs>
    <SwipeHint />
    <AccountMenu />
    <ProfileSetupModal />
    <OnboardingTour />
    </View>
    </PremiumProvider>
  );
}
