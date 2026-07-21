// Tutoriel guidé (app) — parité avec le site. Montré UNE FOIS à tout le monde (même les inscrits) à la
// prochaine connexion, skippable, et revoyable depuis le menu compte (bouton « Revoir le tutoriel »).
// Version ROBUSTE : au lieu de mesurer chaque élément (fragile en RN), on affiche une carte en bas de
// l'écran et on NAVIGUE vers l'onglet concerné → l'utilisateur voit l'écran réel pendant l'explication.
import { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useSession } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Nouvelle clé (v2) : tout le monde revoit ce tuto enrichi une fois, même ceux qui avaient vu l'ancien.
const SEEN_KEY = 'intermitrack_tour_v2';

type Step = { route?: string; title: string; text: string };
const STEPS: Step[] = [
  { title: 'Bienvenue 👋', text: "Voici ton tableau de bord. Je te montre l'essentiel en quelques secondes — tu peux passer à tout moment." },
  { route: '/', title: 'Ton compte', text: "En haut à droite (ton rond avec tes initiales) : « Mes informations » (statut, salaire…), le thème et la déconnexion. Renseigne tes infos, ça pré-remplit tes missions." },
  { route: '/', title: 'Ta progression', text: "Le graphique montre tes heures effectuées et prévues vers les 507 h, avec le détail par mois en dessous, et plus bas la saisie de tes montants réels reçus." },
  { route: '/calendar', title: 'Le calendrier', text: "Importe tes dates (agenda, Excel, notes) ou touche un jour pour ajouter une mission. Ça dépend de ton statut — d'où l'importance de bien renseigner tes infos." },
  { route: '/calendar', title: 'Tes évènements du mois', text: "Sous le calendrier, retrouve toutes tes missions et notes du mois, triées par date." },
  { route: '/missions', title: 'Tes productions', text: "Le camembert répartit ton brut par production. Touche une prod pour changer sa couleur, la renommer, la fusionner ou régler ses heures sup." },
  { route: '/', title: 'À toi de jouer 🎬', text: "Explore les autres onglets (Actu, Simulation, Fiscalité…) quand tu veux. Tu pourras revoir ce tuto depuis ton menu compte." },
];

// Déclencheur global (même principe que openMesInfos) : le bouton « Revoir le tutoriel » du menu l'appelle.
let _startTourFn: (() => void) | null = null;
export function startTour() { if (_startTourFn) _startTourFn(); }

export default function OnboardingTour() {
  const C: any = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const uid = session?.user?.id;
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);

  const show = useCallback((i: number) => {
    const step = STEPS[i];
    if (step.route) { try { router.navigate(step.route as any); } catch (e) {} }
    setIdx(i); setVisible(true);
  }, []);
  const start = useCallback(() => { show(0); }, [show]);

  // Rendre le déclencheur global disponible pour le menu compte.
  useEffect(() => {
    _startTourFn = start;
    return () => { if (_startTourFn === start) _startTourFn = null; };
  }, [start]);

  // Auto-démarrage une seule fois, pour tout utilisateur connecté (même inscrits).
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try { const seen = await AsyncStorage.getItem(SEEN_KEY); if (seen || cancelled) return; } catch (e) { return; }
      setTimeout(() => { if (!cancelled) start(); }, 1000);
    })();
    return () => { cancelled = true; };
  }, [uid, start]);

  function end() { setVisible(false); AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {}); }
  function next() { if (idx >= STEPS.length - 1) end(); else show(idx + 1); }

  if (!visible) return null;
  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={end}>
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.line, marginBottom: insets.bottom + 16 }]}>
          <Text style={[styles.title, { color: C.petrol }]}>{step.title}</Text>
          <Text style={[styles.text, { color: C.muted }]}>{step.text}</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={end} hitSlop={8}><Text style={[styles.skip, { color: C.muted }]}>Passer le tuto</Text></TouchableOpacity>
            <View style={styles.right}>
              <Text style={[styles.count, { color: C.muted }]}>{idx + 1} / {STEPS.length}</Text>
              <TouchableOpacity style={[styles.next, { backgroundColor: C.petrol }]} onPress={next} activeOpacity={0.85}>
                <Text style={styles.nextTxt}>{isLast ? 'Terminer' : 'Suivant'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,20,30,0.45)' },
  card: { marginHorizontal: 16, borderRadius: 18, borderWidth: 1, padding: 18, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  title: { fontSize: 17, fontWeight: '900', marginBottom: 6 },
  text: { fontSize: 13.5, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  skip: { fontSize: 12.5, fontWeight: '700', textDecorationLine: 'underline' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { fontSize: 11, fontWeight: '700' },
  next: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  nextTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
});
