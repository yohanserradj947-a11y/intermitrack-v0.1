import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { resolveProfileGate } from '../lib/introFlow';
import { emitProfilChanged } from './AccountMenu';
import TxtInput from './TxtInput';

// Réglage du profil au 1er lancement (et tant que le statut n'est pas choisi).
// Détection « pas encore réglé » = colonne `annexe` VIDE en base (pas de nouvelle colonne).
// Réapparition : 1×/jour max tant que non réglé ; plus jamais dès que le statut est enregistré.
const DAY_KEY = 'intermitrack_profilsetup_day';
const PREVIEW = false;

type Statut = 'technicien' | 'artiste' | 'les_deux';
const OPTIONS: { val: Statut; icon: any; label: string; hint: string }[] = [
  { val: 'technicien', icon: 'construct-outline', label: 'Technicien', hint: 'Journée = 8 h' },
  { val: 'artiste', icon: 'musical-notes-outline', label: 'Artiste', hint: 'Cachet = 12 h' },
  { val: 'les_deux', icon: 'git-merge-outline', label: 'Les deux', hint: 'Journée = 8 h par défaut' },
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ProfileSetupModal() {
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const { session } = useSession();
  const uid = session?.user?.id;
  const [visible, setVisible] = useState(false);
  const [statut, setStatut] = useState<Statut | ''>('');
  const [salaire, setSalaire] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (PREVIEW) { setVisible(true); return; }
      if (!uid) { resolveProfileGate(); return; }
      let annexe: string | null = null;
      try {
        const { data } = await supabase.from('profiles').select('annexe').eq('id', uid).maybeSingle();
        annexe = (data && (data as any).annexe) || null;
      } catch (e) { resolveProfileGate(); return; }
      if (annexe) { resolveProfileGate(); return; }          // déjà réglé -> le tuto peut suivre
      let last: string | null = null;
      try { last = await AsyncStorage.getItem(DAY_KEY); } catch (e) {}
      if (last === ymd(new Date())) { resolveProfileGate(); return; } // déjà montré aujourd'hui
      setVisible(true);                                       // on résout SEULEMENT à la fermeture
    })();
  }, [uid]);

  // « Plus tard » : on note la date du jour -> pas de réapparition avant demain.
  async function later() {
    try { await AsyncStorage.setItem(DAY_KEY, ymd(new Date())); } catch (e) {}
    setVisible(false);
    resolveProfileGate();
  }

  async function save() {
    if (!statut || saving) return;
    setSaving(true);
    try {
      await supabase.from('profiles').upsert({ id: uid, annexe: statut }, { onConflict: 'id' });
      const sal = Number(String(salaire).replace(',', '.'));
      if (sal > 0) {
        try { await supabase.from('profiles').upsert({ id: uid, salaire_journalier: sal }, { onConflict: 'id' }); } catch (e) {}
      }
      try { await AsyncStorage.setItem(DAY_KEY, ymd(new Date())); } catch (e) {}
      emitProfilChanged();
    } catch (e) {}
    setSaving(false);
    setVisible(false);
    resolveProfileGate();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={later}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}><Ionicons name="person-circle-outline" size={40} color={C.petrol} /></View>
          <Text style={s.title}>Règle ton profil</Text>
          <Text style={s.sub}>Deux infos pour que tout se pré-remplisse : tes heures, tes prix et tes calculs France Travail.</Text>

          <Text style={s.label}>Ton statut</Text>
          {OPTIONS.map((o) => {
            const on = statut === o.val;
            return (
              <TouchableOpacity key={o.val} style={[s.opt, on && s.optOn]} onPress={() => setStatut(o.val)} activeOpacity={0.8}>
                <Ionicons name={o.icon} size={20} color={on ? C.petrol : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.optLabel, on && { color: C.petrol }]}>{o.label}</Text>
                  <Text style={s.optHint}>{o.hint}</Text>
                </View>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.petrol : C.line} />
              </TouchableOpacity>
            );
          })}

          <Text style={[s.label, { marginTop: 12 }]}>Salaire journalier brut <Text style={s.opt2}>(facultatif)</Text></Text>
          <TxtInput
            style={s.input}
            value={salaire}
            onChangeText={setSalaire}
            keyboardType="numeric"
            placeholder="ex : 230"
            placeholderTextColor={C.muted}
          />
          <Text style={s.help}>Pré-remplit le prix de tes missions et de tes imports. Modifiable à tout moment.</Text>

          <TouchableOpacity style={[s.btn, !statut && s.btnOff]} onPress={save} disabled={!statut || saving} activeOpacity={0.85}>
            <Text style={s.btnTxt}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.skip} onPress={later}>
            <Text style={s.skipTxt}>Plus tard</Text>
          </TouchableOpacity>
          <Text style={s.foot}>Réglable à tout moment depuis ton espace, en haut à droite.</Text>
        </View>
      </View>
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  card: { backgroundColor: C.card, borderRadius: 24, paddingVertical: 22, paddingHorizontal: 18, width: '100%', maxWidth: 420 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.soft, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 21, fontWeight: '900', color: C.petrol, letterSpacing: -0.4, textAlign: 'center' },
  sub: { fontSize: 13.5, color: C.muted, marginTop: 6, marginBottom: 14, lineHeight: 19, textAlign: 'center' },
  label: { fontSize: 12.5, fontWeight: '800', color: C.text, marginBottom: 8 },
  opt2: { fontSize: 12, fontWeight: '600', color: C.muted },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 8 },
  optOn: { borderColor: C.petrol, backgroundColor: C.soft },
  optLabel: { fontSize: 14.5, fontWeight: '800', color: C.text },
  optHint: { fontSize: 12, color: C.muted, marginTop: 1 },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, fontWeight: '700', color: C.text, backgroundColor: C.card },
  help: { fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 16 },
  btn: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  btnOff: { opacity: 0.4 },
  btnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  skip: { paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  skipTxt: { color: C.muted, fontWeight: '700', fontSize: 14 },
  foot: { fontSize: 11.5, color: C.muted, textAlign: 'center', marginTop: 2 },
});
