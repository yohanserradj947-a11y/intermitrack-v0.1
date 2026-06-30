import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/auth';

// Clé versionnée : pour réafficher le pop-up lors d'une PROCHAINE mise à jour,
// il suffira de changer cette clé (ex: _v1_0_3) et de mettre à jour ITEMS.
const SEEN_KEY = 'intermitrack_whatsnew_v1_1_0';

const ITEMS: { icon: any; title: string; text: string }[] = [
  { icon: 'color-palette-outline', title: 'Couleurs par production', text: "Donne une couleur à chaque prod : elle s'applique au calendrier, à tes missions et au graphique. Palette + roue de couleurs perso." },
  { icon: 'create-outline', title: 'Notes perso', text: 'Ajoute des notes sur ton calendrier (RDV, congés, repos…) avec une couleur, sans les mélanger à tes missions.' },
  { icon: 'location-outline', title: 'Lieu des missions', text: 'Un champ « Lieu » sur tes missions, avec suggestions de tes lieux déjà saisis.' },
  { icon: 'briefcase-outline', title: 'Tes postes', text: 'Ajoute tes propres postes (ex : Clown, Cascadeur) — ils reviennent automatiquement sur tes prochaines missions.' },
  { icon: 'receipt-outline', title: 'Factures plus rapides', text: 'Auto-entrepreneur : ajoute tes prestations via une liste à cocher, avec tes prestations perso mémorisées.' },
  { icon: 'sparkles-outline', title: 'Plus lisible', text: 'Icônes premium sur les cartes, contours plus nets et finitions un peu partout.' },
];

export default function WhatsNewModal() {
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const { session } = useSession();
  const uid = session?.user?.id;
  const [visible, setVisible] = useState(false);

  // Le « Quoi de neuf » est pour les utilisateurs existants (avec missions).
  // Les nouveaux (sans mission) voient le tuto d'onboarding à la place.
  useEffect(() => {
    (async () => {
      if (!uid) return;
      const seen = await AsyncStorage.getItem(SEEN_KEY);
      if (seen) return;
      try { const { count } = await supabase.from('missions').select('id', { count: 'exact', head: true }); if ((count || 0) > 0) { await AsyncStorage.setItem(SEEN_KEY, '1'); setVisible(true); } } catch (e) {}
    })();
  }, [uid]);

  async function close() {
    await AsyncStorage.setItem(SEEN_KEY, '1');
    setVisible(false);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.badge}><Text style={s.badgeTxt}>✨ Nouveautés</Text></View>
          <Text style={s.title}>Quoi de neuf ?</Text>
          <Text style={s.sub}>Un résumé rapide des dernières améliorations.</Text>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {ITEMS.map((it, i) => (
              <View key={i} style={s.row}>
                <View style={s.iconWrap}><Ionicons name={it.icon} size={18} color={C.petrol} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{it.title}</Text>
                  <Text style={s.rowText}>{it.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.btn} onPress={close} activeOpacity={0.85}>
            <Text style={s.btnTxt}>C'est parti !</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 22, width: '100%', maxWidth: 420 },
  badge: { alignSelf: 'flex-start', backgroundColor: C.soft, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 10 },
  badgeTxt: { fontSize: 12, fontWeight: '800', color: C.petrol },
  title: { fontSize: 23, fontWeight: '900', color: C.petrol, letterSpacing: -0.5 },
  sub: { fontSize: 13.5, color: C.muted, marginTop: 4, marginBottom: 14 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  iconWrap: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.soft, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: C.text },
  rowText: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  btn: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  btnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
