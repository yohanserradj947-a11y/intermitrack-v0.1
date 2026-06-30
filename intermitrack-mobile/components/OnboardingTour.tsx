import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/auth';
import { useTheme } from '../lib/theme';

const SEEN_KEY = 'intermitrack_onboarding_v1';
const PREVIEW = false;

const STEPS: { icon: any; title: string; text: string }[] = [
  { icon: 'sparkles-outline', title: 'Bienvenue sur Intermitrack', text: "Le tableau de bord des intermittents. On te montre l'essentiel en 4 étapes — 30 secondes." },
  { icon: 'apps-outline', title: 'Tes onglets sont en bas', text: 'Calendrier, missions, actualisation, prévisions, documents, fiscalité… Touche-les ou glisse de gauche à droite.' },
  { icon: 'calendar-outline', title: 'Ajoute tes missions', text: 'Dans le Calendrier, touche un jour pour ajouter une mission (production, heures, cachet, lieu…).' },
  { icon: 'stats-chart-outline', title: 'Tout se calcule tout seul', text: 'Tes 507h, ton estimation France Travail, ta fiscalité et tes stats se mettent à jour automatiquement.' },
];

export default function OnboardingTour() {
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const { session } = useSession();
  const uid = session?.user?.id;
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const scRef = useRef<ScrollView>(null);
  const W = Dimensions.get('window').width - 44;

  useEffect(() => {
    (async () => {
      if (PREVIEW) { setVisible(true); return; }
      if (!uid) return;
      const seen = await AsyncStorage.getItem(SEEN_KEY);
      if (seen) return;
      try {
        const { count } = await supabase.from('missions').select('id', { count: 'exact', head: true });
        if ((count || 0) === 0) { await AsyncStorage.setItem(SEEN_KEY, '1'); setVisible(true); }
      } catch (e) {}
    })();
  }, [uid]);

  async function finish(go?: boolean) {
    await AsyncStorage.setItem(SEEN_KEY, '1');
    setVisible(false);
    if (go) setTimeout(() => { try { router.navigate('/calendar'); } catch (e) {} }, 250);
  }
  function next() {
    if (step < STEPS.length - 1) { const n = step + 1; setStep(n); scRef.current?.scrollTo({ x: n * W, animated: true }); }
    else finish(true);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => finish(false)}>
      <View style={s.overlay}>
        <View style={[s.card, { width: W }]}>
          <ScrollView ref={scRef} horizontal pagingEnabled scrollEnabled={false} showsHorizontalScrollIndicator={false} style={{ width: W }}>
            {STEPS.map((st, i) => (
              <View key={i} style={{ width: W, alignItems: 'center', paddingHorizontal: 6 }}>
                <View style={s.iconWrap}><Ionicons name={st.icon} size={42} color={C.petrol} /></View>
                <Text style={s.title}>{st.title}</Text>
                <Text style={s.sub}>{st.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={s.dots}>{STEPS.map((_, i) => (<View key={i} style={[s.dot, i === step && s.dotOn]} />))}</View>
          <TouchableOpacity style={s.btn} onPress={next} activeOpacity={0.85}>
            <Text style={s.btnTxt}>{step < STEPS.length - 1 ? 'Suivant' : 'Ajouter ma 1re mission'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.skip} onPress={() => finish(false)}>
            <Text style={s.skipTxt}>{step < STEPS.length - 1 ? 'Passer' : 'Plus tard'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  card: { backgroundColor: C.card, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 16, alignItems: 'center' },
  iconWrap: { width: 70, height: 70, borderRadius: 22, backgroundColor: C.soft, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 21, fontWeight: '900', color: C.petrol, letterSpacing: -0.4, textAlign: 'center' },
  sub: { fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 20, textAlign: 'center', minHeight: 80 },
  dots: { flexDirection: 'row', gap: 7, marginTop: 6, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.line },
  dotOn: { backgroundColor: C.petrol, width: 20 },
  btn: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 15, alignItems: 'center', width: '100%' },
  btnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  skip: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  skipTxt: { color: C.muted, fontWeight: '700', fontSize: 14 },
});
