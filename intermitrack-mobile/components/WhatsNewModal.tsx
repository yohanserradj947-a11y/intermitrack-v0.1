import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';

// Clé versionnée : pour réafficher le pop-up lors d'une PROCHAINE mise à jour,
// il suffira de changer cette clé (ex: _v1_0_3) et de mettre à jour ITEMS.
const SEEN_KEY = 'intermitrack_whatsnew_v1_0_2';

const ITEMS: { icon: any; title: string; text: string }[] = [
  { icon: 'shield-checkmark-outline', title: 'Sécurité renforcée', text: 'Audit complet : HTTPS forcé, en-têtes de sécurité (score A) et données mieux protégées.' },
  { icon: 'cash-outline', title: 'Estimation France Travail', text: "Une estimation de tes allocations (ARE), calculée à partir de tes missions et de ta date d'admission." },
  { icon: 'car-outline', title: 'Frais kilométriques', text: 'Calcul automatique de la distance et application du barème officiel.' },
  { icon: 'stats-chart-outline', title: 'Calculs & prévisions', text: 'Heures, net estimé, fiscalité et moyenne €/h mis à jour automatiquement.' },
  { icon: 'moon-outline', title: 'Mode sombre', text: 'Active-le depuis ton menu compte (icône en haut à droite).' },
  { icon: 'calendar-outline', title: 'Date ARE & session', text: "Ta date ARE reste enregistrée, et tu n'es plus déconnecté(e) tout(e) seul(e)." },
  { icon: 'musical-notes-outline', title: 'Musique, cachets & Pionnier', text: 'Nouveaux types de mission musique, libellé « vacations / cachets » et badge « Pionnier — gratuit à vie ».' },
];

export default function WhatsNewModal() {
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem(SEEN_KEY);
      if (!seen) setVisible(true);
    })();
  }, []);

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
