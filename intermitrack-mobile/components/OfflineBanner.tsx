import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline, usePending } from '../lib/offlineMissions';

// Bandeau discret affiché en haut : « Hors ligne » quand on tourne sur le cache, et/ou
// « X en attente de synchro » quand des missions saisies hors ligne restent à envoyer.
export default function OfflineBanner() {
  const offline = useOffline();
  const pending = usePending();
  const insets = useSafeAreaInsets();
  if (!offline && pending === 0) return null;
  const label = offline
    ? (pending > 0 ? `Hors ligne — ${pending} mission${pending > 1 ? 's' : ''} en attente de synchro` : 'Hors ligne — affichage de tes dernières données')
    : `${pending} mission${pending > 1 ? 's' : ''} en attente de synchro…`;
  return (
    <View style={[s.wrap, { paddingTop: (insets.top || 0) + 6 }]} pointerEvents="none">
      <View style={[s.pill, !offline && { backgroundColor: '#1F4E5F' }]}>
        <Ionicons name={offline ? 'cloud-offline-outline' : 'sync-outline'} size={14} color="#fff" />
        <Text style={s.txt}>{label}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 100050, paddingBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#B45309', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  txt: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
