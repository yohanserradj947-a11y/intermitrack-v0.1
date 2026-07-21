import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '../lib/offlineMissions';

// Bandeau discret affiché en haut quand l'appli fonctionne sur les données en cache
// (réseau indisponible). Se masque tout seul dès qu'un chargement réussit.
export default function OfflineBanner() {
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View style={[s.wrap, { paddingTop: (insets.top || 0) + 6 }]} pointerEvents="none">
      <View style={s.pill}>
        <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
        <Text style={s.txt}>Hors ligne — affichage de tes dernières données</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 100050, paddingBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#B45309', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  txt: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
