import { showAlert } from '../lib/dialog';
import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeControls } from '../lib/theme';
import { useNotes, Note, ArretType, ARRET_META, ARRET_ORDER, arretHoursPerDay, daysInclusive, NOTE_PRESETS } from '../lib/notes';
import TxtInput from './TxtInput';
import ColorPickerModal from './ColorPickerModal';

function iso(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// Texte pédagogique + source par type d'arrêt. On n'affiche AUCUN cumul d'heures pour l'instant :
// les formules exactes sont en cours de vérification. On invite les gens à témoigner de leur vécu.
function explain(type: ArretType) {
  const bodies: Record<ArretType, string> = {
    accident_travail: `Pendant un accident du travail, ton statut est protégé : tu es indemnisé par la Sécurité sociale et tu ne perds pas tes heures. Tu repars là où tu en étais à la reprise.`,
    maternite: `Ton congé maternité protège ton statut d'intermittente : tu es indemnisée et tu ne perds pas tes droits.`,
    adoption: `Ton congé d'adoption protège ton statut : tu es indemnisé et tu ne perds pas tes droits.`,
    maladie: `Un arrêt maladie ne te fait pas perdre ton statut : tu es indemnisé par la Sécu et ta période est protégée.`,
    paternite: `Ton congé paternité protège ton statut.`,
  };
  return {
    body: `${bodies[type]} La façon exacte dont il compte dans tes 507 h est encore à confirmer, on ne compte donc pas d'heures pour l'instant. Si tu as déjà été dans ce cas, n'hésite pas à nous écrire pour nous faire part de ton expérience et de tes retours : ça nous aide à fiabiliser le calcul.`,
    calc: `Impact sur les 507 h : formule exacte en cours d'étude`,
    source: `En cours de vérification sur sources officielles (règlement Unédic / France Travail / CPAM).`,
    counts: false,
  };
}

export default function ArretFormModal({ visible, editNote, defaultDate, onClose }: { visible: boolean; editNote: Note | null; defaultDate: string; onClose: () => void }) {
  const C: any = useTheme();
  const { scheme } = useThemeControls();
  const s = makeS(C);
  const insets = useSafeAreaInsets();
  const { addNote, updateNote } = useNotes();

  const [type, setType] = useState<ArretType>('maternite');
  const [pendant, setPendant] = useState(true);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [text, setText] = useState('');
  const [color, setColor] = useState(ARRET_META.maternite.color);
  const [colorTouched, setColorTouched] = useState(false);   // true dès que l'utilisateur choisit lui-même
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editNote) {
      const t = editNote.arretType || 'maternite';
      setType(t);
      setPendant(editNote.pendantContrat !== false);
      setStart(new Date(editNote.date + 'T00:00:00'));
      setEnd(new Date((editNote.endDate || editNote.date) + 'T00:00:00'));
      setText(editNote.text || '');
      setColor(editNote.color || ARRET_META[t].color); setColorTouched(true);
    } else {
      const d = defaultDate ? new Date(defaultDate + 'T00:00:00') : new Date();
      setType('maternite'); setPendant(true); setStart(d); setEnd(d); setText('');
      setColor(ARRET_META.maternite.color); setColorTouched(false);
    }
  }, [visible]);

  // Change de type : la couleur suit le type tant que l'utilisateur ne l'a pas choisie lui-même.
  function pickType(t: ArretType) { setType(t); if (!colorTouched) setColor(ARRET_META[t].color); }

  const meta = ARRET_META[type];
  const ask = meta.ask;                       // maladie / paternité → on demande pendant/hors mission
  const startISO = iso(start), endISO = iso(end);
  const validDates = endISO >= startISO;
  const nbDays = daysInclusive(startISO, endISO);
  const hpd = arretHoursPerDay(type, pendant);
  const assim = Math.round(hpd * nbDays * 10) / 10;
  const info = explain(type);

  function save() {
    if (!validDates) { showAlert('Dates', 'La date de fin ne peut pas être avant le début.'); return; }
    const data = {
      date: startISO, endDate: endISO, title: meta.label, text: text.trim(), color,
      kind: 'arret' as const, arretType: type, pendantContrat: ask ? pendant : true, hours: assim,
    };
    if (editNote) updateNote(editNote.id, data); else addNote(data);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
        <View style={s.overlay}>
          <View style={[s.card, { paddingBottom: 22 + insets.bottom }]}>
            <View style={s.header}>
              <Text style={s.title}>{editNote ? 'Modifier l’arrêt' : 'Arrêt / congé'}</Text>
              <TouchableOpacity style={s.close} onPress={onClose} hitSlop={8}><Text style={s.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={s.intro}>Certains arrêts comptent dans tes 507 h. Choisis le type, on t'explique exactement comment ça compte.</Text>

              <Text style={s.label}>Type d'arrêt</Text>
              <View style={s.typeGrid}>
                {ARRET_ORDER.map(t => {
                  const m = ARRET_META[t]; const on = t === type;
                  return (
                    <TouchableOpacity key={t} style={[s.typeBtn, on && { borderColor: m.color, backgroundColor: m.color + '14' }]} activeOpacity={0.85} onPress={() => pickType(t)}>
                      <Ionicons name={m.icon as any} size={18} color={on ? m.color : C.muted} />
                      <Text style={[s.typeTxt, { color: on ? m.color : C.text }]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Date début</Text>
                  <TouchableOpacity style={s.input} onPress={() => setShowStart(true)}><Text style={s.inputTxt}>{start.toLocaleDateString('fr-FR')}</Text></TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Date fin</Text>
                  <TouchableOpacity style={s.input} onPress={() => setShowEnd(true)}><Text style={s.inputTxt}>{end.toLocaleDateString('fr-FR')}</Text></TouchableOpacity>
                </View>
              </View>
              {showStart && <DateTimePicker value={start} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setShowStart(false); if (d) { setStart(d); if (d > end) setEnd(d); } }} />}
              {showEnd && <DateTimePicker value={end} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setShowEnd(false); if (d) setEnd(d); }} />}

              {ask && (<>
                <Text style={s.label}>Cet arrêt tombe…</Text>
                <View style={s.segRow}>
                  <TouchableOpacity style={[s.seg, pendant && s.segOn]} onPress={() => setPendant(true)}>
                    <Text style={[s.segTxt, pendant && s.segTxtOn]}>Pendant une mission</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.seg, !pendant && s.segOn]} onPress={() => setPendant(false)}>
                    <Text style={[s.segTxt, !pendant && s.segTxtOn]}>Entre deux missions</Text>
                  </TouchableOpacity>
                </View>
              </>)}

              {/* Encart pédagogique + calcul en direct + source */}
              <View style={[s.info, { borderColor: meta.color + '55', backgroundColor: meta.color + '0E' }]}>
                <View style={s.infoHead}>
                  <Ionicons name="information-circle-outline" size={16} color={meta.color} />
                  <Text style={[s.infoHeadTxt, { color: meta.color }]}>Comment ça compte ?</Text>
                </View>
                <Text style={s.infoBody}>{info.body}</Text>
                {validDates && (
                  <View style={[s.calcBox, { backgroundColor: info.counts ? meta.color + '18' : C.soft }]}>
                    <Text style={[s.calcTxt, { color: info.counts ? meta.color : C.muted }]}>{info.calc}</Text>
                  </View>
                )}
                <Text style={s.src}>📖 {info.source}</Text>
                <Text style={s.study}>Règle que nous continuons de vérifier.</Text>
              </View>

              {/* Avertissement global, toujours visible : la fonctionnalité est expérimentale. */}
              <View style={s.warn}>
                <Text style={s.warnTxt}><Text style={s.warnB}>Fonctionnalité en expérimentation.</Text> Les règles France Travail sont complexes et les sources publiques sont rares : prends ces calculs avec prudence, ils sont indicatifs. En cas de doute, vérifie toujours auprès de France Travail.</Text>
                <Text style={s.warnSrc}>Nos sources : règlement Unédic, annexes 8 et 10, article 3 — §2 (suspension du contrat = 5 h/jour), §3 (maternité, adoption, accident du travail assimilés hors contrat), §4 (maladie hors contrat = décalage de période) — et circulaire Unédic n° 2016-25.</Text>
              </View>

              <Text style={s.label}>Note (facultatif)</Text>
              <TxtInput style={[s.input, { height: 70, textAlignVertical: 'top' }]} value={text} onChangeText={setText} maxLength={200} multiline placeholder="Ex : nom de la prod, référence…" placeholderTextColor={C.muted} />

              <Text style={s.label}>Couleur (repère sur le calendrier)</Text>
              <View style={s.colorRow}>
                {NOTE_PRESETS.concat(customColors).map(hex => (
                  <TouchableOpacity key={hex} style={[s.colorSw, { backgroundColor: hex }, hex.toLowerCase() === color.toLowerCase() && s.colorSwOn]} onPress={() => { setColor(hex); setColorTouched(true); }} />
                ))}
                <TouchableOpacity style={s.colorAdd} onPress={() => setPickerOpen(true)}><Text style={s.colorAddTxt}>+</Text></TouchableOpacity>
              </View>

              <TouchableOpacity style={[s.save, { backgroundColor: meta.color }]} onPress={save}><Text style={s.saveTxt}>{editNote ? 'Modifier l’arrêt' : 'Enregistrer l’arrêt'}</Text></TouchableOpacity>
              <TouchableOpacity style={s.cancel} onPress={onClose}><Text style={s.cancelTxt}>Annuler</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ColorPickerModal visible={pickerOpen} initial={color} onClose={() => setPickerOpen(false)} onPick={(hex) => { setCustomColors(prev => prev.map(c => c.toLowerCase()).includes(hex.toLowerCase()) || NOTE_PRESETS.map(c => c.toLowerCase()).includes(hex.toLowerCase()) ? prev : [...prev, hex]); setColor(hex); setColorTouched(true); setPickerOpen(false); }} />
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '900', color: C.petrol, flex: 1 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft },
  closeTxt: { fontSize: 16, color: C.muted, fontWeight: '800' },
  intro: { fontSize: 12.5, color: C.muted, marginBottom: 4, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 14, marginBottom: 6 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  typeTxt: { fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.card },
  inputTxt: { fontSize: 15, color: C.text },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', backgroundColor: C.card },
  segOn: { borderColor: C.petrol, backgroundColor: C.soft },
  segTxt: { fontSize: 12.5, fontWeight: '800', color: C.muted },
  segTxtOn: { color: C.petrol },
  info: { marginTop: 16, borderRadius: 14, padding: 14, borderWidth: 1 },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  infoHeadTxt: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
  infoBody: { fontSize: 13, color: C.text, lineHeight: 19 },
  calcBox: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 },
  calcTxt: { fontSize: 14.5, fontWeight: '900', textAlign: 'center' },
  src: { fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 16 },
  study: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 3 },
  warn: { marginTop: 12, borderRadius: 12, padding: 12, backgroundColor: 'rgba(217,119,6,0.10)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.35)' },
  warnTxt: { fontSize: 12, color: C.text, lineHeight: 17 },
  warnB: { fontWeight: '900', color: '#B45309' },
  warnSrc: { fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 15 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 2 },
  colorSw: { width: 32, height: 32, borderRadius: 9, borderWidth: 2, borderColor: 'transparent' },
  colorSwOn: { borderColor: C.text },
  colorAdd: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  colorAddTxt: { fontSize: 18, fontWeight: '800', color: C.muted, lineHeight: 20 },
  save: { borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelTxt: { color: C.muted, fontWeight: '700', fontSize: 14 },
});
