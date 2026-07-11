import { showAlert } from '../lib/dialog';
import { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useProdColors, PROD_PRESETS } from '../lib/prodColors';
import NumInput from './NumInput';
import ColorPickerModal from './ColorPickerModal';

function iso(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function monthLabel(d: Date) { const l = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return l.charAt(0).toUpperCase() + l.slice(1); }

// Saisie rapide : le total heures + brut d'un mois d'un coup, sans détailler mission par mission.
// Crée UNE mission-résumé (mission_type = 'Saisie rapide') → alimente les 507 h et l'estimation FT comme une mission.
export default function QuickEntryModal({ visible, defaultDate, missions, onClose, onSaved }: { visible: boolean; defaultDate: string; missions: any[]; onClose: () => void; onSaved: () => void }) {
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const insets = useSafeAreaInsets();
  const { setColor, custom, addCustom } = useProdColors();
  const [monthRef, setMonthRef] = useState(new Date());
  const [hours, setHours] = useState('');
  const [gross, setGross] = useState('');
  const [jours, setJours] = useState('');
  const [color, setColorSel] = useState<string>(PROD_PRESETS[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const prodName = 'RÉCAP ' + monthLabel(monthRef).toUpperCase();

  useEffect(() => {
    if (!visible) return;
    const d = defaultDate ? new Date(defaultDate + 'T00:00:00') : new Date();
    d.setDate(1);
    setMonthRef(d); setHours(''); setGross(''); setJours('');
  }, [visible]);

  const y = monthRef.getFullYear(), mo = monthRef.getMonth();
  // Missions détaillées déjà présentes ce mois (hors saisie rapide) → avertissement double comptage.
  const hasDetailed = useMemo(() => missions.some((x: any) => { const d = new Date(x.mission_date + 'T00:00:00'); return d.getFullYear() === y && d.getMonth() === mo && x.mission_type !== 'Saisie rapide'; }), [missions, y, mo]);
  // Saisie rapide déjà existante ce mois → on la remplace au lieu d'en créer une deuxième.
  const existing = useMemo(() => missions.find((x: any) => { const d = new Date(x.mission_date + 'T00:00:00'); return d.getFullYear() === y && d.getMonth() === mo && x.mission_type === 'Saisie rapide'; }), [missions, y, mo]);

  function moveMonth(n: number) { setMonthRef(d => { const nd = new Date(d); nd.setDate(1); nd.setMonth(nd.getMonth() + n); return nd; }); }

  async function save() {
    const h = Number((hours || '').replace(',', '.'));
    if (!h || h <= 0) { showAlert('Heures manquantes', 'Indique le total d\'heures du mois.'); return; }
    const g = Number((gross || '').replace(',', '.')) || 0;
    const j = Number((jours || '').replace(',', '.')) || 0;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showAlert('Erreur', 'Tu n\'es plus connecté.'); setSaving(false); return; }
    const payload = { user_id: user.id, production: prodName, emission: null, lieu: null, mission_type: 'Saisie rapide', mission_date: iso(monthRef), end_date: null, hours: Math.round(h * 10) / 10, vacations: j > 0 ? Math.round(j) : 1, gross_amount: Math.round(g), status: 'effectue', km_distance: 0, km_rate: 0, km_amount: 0 };
    const { error } = existing ? await supabase.from('missions').update(payload).eq('id', existing.id) : await supabase.from('missions').insert(payload);
    setSaving(false);
    if (error) { showAlert('Erreur', error.message); return; }
    setColor(prodName, color); // couleur choisie (comme une production)
    onSaved(); onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.overlay}>
          <View style={[s.card, { paddingBottom: 22 + insets.bottom }]}>
            <View style={s.header}>
              <Text style={s.title}>Saisie rapide du mois</Text>
              <TouchableOpacity style={s.close} onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.intro}>Le total du mois d&apos;un coup, sans détailler chaque mission. Compté dans tes 507 h et l&apos;estimation France Travail.</Text>

              <Text style={s.label}>Mois concerné</Text>
              <View style={s.monthNav}>
                <TouchableOpacity style={s.navBtn} onPress={() => moveMonth(-1)}><Ionicons name="chevron-back" size={18} color={C.petrol} /></TouchableOpacity>
                <Text style={s.monthLbl}>{monthLabel(monthRef)}</Text>
                <TouchableOpacity style={s.navBtn} onPress={() => moveMonth(1)}><Ionicons name="chevron-forward" size={18} color={C.petrol} /></TouchableOpacity>
              </View>

              <View style={s.row}>
                <View style={{ flex: 1 }}><Text style={s.label}>Total heures</Text><NumInput style={s.input} value={hours} onChangeText={setHours} placeholder="Ex : 120" placeholderTextColor={C.muted} /></View>
                <View style={{ flex: 1 }}><Text style={s.label}>Brut total (€)</Text><NumInput style={s.input} value={gross} onChangeText={setGross} placeholder="Ex : 3200" placeholderTextColor={C.muted} /></View>
              </View>

              <Text style={s.label}>Jours / cachets (facultatif)</Text>
              <NumInput style={s.input} value={jours} onChangeText={setJours} placeholder="Ex : 15" placeholderTextColor={C.muted} />

              <Text style={s.label}>Couleur</Text>
              <View style={s.colorRow}>
                {PROD_PRESETS.concat(custom).map((hex: string) => (
                  <TouchableOpacity key={hex} style={[s.colorSw, { backgroundColor: hex }, hex.toLowerCase() === color.toLowerCase() && s.colorSwOn]} onPress={() => setColorSel(hex)} />
                ))}
                <TouchableOpacity style={s.colorAdd} onPress={() => setPickerOpen(true)}><Text style={s.colorAddTxt}>+</Text></TouchableOpacity>
              </View>

              {hasDetailed && (
                <View style={s.warn}>
                  <Ionicons name="warning-outline" size={15} color={C.orange} style={{ marginTop: 1 }} />
                  <Text style={s.warnTxt}>Ce mois contient déjà des missions détaillées. Pour ne pas compter les heures en double, utilise soit le détail, soit la saisie rapide — pas les deux.</Text>
                </View>
              )}

              <TouchableOpacity style={s.save} onPress={save} disabled={saving}><Text style={s.saveTxt}>{saving ? 'Enregistrement…' : (existing ? 'Mettre à jour le mois' : 'Enregistrer le mois')}</Text></TouchableOpacity>
              <TouchableOpacity style={s.cancel} onPress={onClose}><Text style={s.cancelTxt}>Annuler</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ColorPickerModal visible={pickerOpen} initial={color} onClose={() => setPickerOpen(false)} onPick={(hex: string) => { addCustom(hex); setColorSel(hex); setPickerOpen(false); }} />
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '900', color: C.petrol },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft },
  intro: { fontSize: 12.5, color: C.muted, lineHeight: 17, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  monthLbl: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: C.petrol, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 11 },
  row: { flexDirection: 'row', gap: 10 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.card },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  colorSw: { width: 32, height: 32, borderRadius: 9, borderWidth: 2, borderColor: 'transparent' },
  colorSwOn: { borderColor: C.text },
  colorAdd: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  colorAddTxt: { fontSize: 18, fontWeight: '800', color: C.muted, lineHeight: 20 },
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 14, backgroundColor: C.soft, borderRadius: 12, padding: 12 },
  warnTxt: { flex: 1, fontSize: 12, color: C.text, lineHeight: 17 },
  save: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelTxt: { color: C.muted, fontWeight: '700', fontSize: 14 },
});
