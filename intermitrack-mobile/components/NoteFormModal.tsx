import { showAlert } from '../lib/dialog';
import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeControls } from '../lib/theme';
import { useNotes, Note, NOTE_PRESETS } from '../lib/notes';
import ColorPickerModal from './ColorPickerModal';

const SUGGESTIONS = ['Médical', 'Perso', 'Vacances', 'Repos', 'Autres'];
const ORG_SUGGESTIONS = ['AFDAS', 'CFPTS', 'INA', 'GRETA', 'CFA'];
function iso(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function isNextDayISO(a: string, b: string) { const d = new Date(a + 'T00:00:00'); d.setDate(d.getDate() + 1); return iso(d) === b; }
const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']; // index 0 = lundi

export default function NoteFormModal({ visible, editNote, defaultDate, mode = 'note', onClose }: { visible: boolean; editNote: Note | null; defaultDate: string; mode?: 'note' | 'formation'; onClose: () => void }) {
  const C = useTheme();
  const { scheme } = useThemeControls();
  const s = makeS(C);
  const insets = useSafeAreaInsets();
  const { addNote, addNotes, updateNote } = useNotes();

  // Une formation = une note avec des heures. Le formulaire s'adapte selon le mode.
  const isForm = editNote ? editNote.kind === 'formation' : mode === 'formation';

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [hours, setHours] = useState('');
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [color, setColor] = useState(NOTE_PRESETS[0]);
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>([]);
  // Formation sur plusieurs mois : motif hebdo (Lun..Dim) + heures/jour → génère les jours, ajustables 1 par 1.
  const [weekdays, setWeekdays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [perDayHours, setPerDayHours] = useState('');
  const [formDays, setFormDays] = useState<{ date: string; checked: boolean; hours: number }[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (editNote) {
      setTitle(editNote.title || '');
      setText(editNote.text || '');
      setHours(editNote.hours != null ? String(editNote.hours) : '');
      setStart(new Date((editNote.date) + 'T00:00:00'));
      setEnd(new Date((editNote.endDate || editNote.date) + 'T00:00:00'));
      setColor(editNote.color || NOTE_PRESETS[0]);
    } else {
      const d = defaultDate ? new Date(defaultDate + 'T00:00:00') : new Date();
      setTitle(''); setText(''); setHours(''); setStart(d); setEnd(d); setColor(NOTE_PRESETS[0]);
    }
    setWeekdays([false, false, false, false, false, false, false]); setPerDayHours(''); setFormDays([]);
  }, [visible]);

  function save() {
    const startISO = iso(start), endISO = iso(end);
    if (endISO < startISO) { showAlert('Dates', 'La date de fin ne peut pas être avant le début.'); return; }
    if (isForm) {
      if (!title.trim()) { showAlert('Organisme manquant', 'Indique l\'organisme de formation.'); return; }
      if (multiDay) {
        if (!formDays.length) { showAlert('Jours à définir', 'Choisis les jours (motif hebdo + heures/jour) puis « Générer ».'); return; }
        const checked = formDays.filter(d => d.checked && (Number(d.hours) || 0) > 0);
        if (!checked.length) { showAlert('Aucun jour', 'Coche au moins un jour de formation avec des heures.'); return; }
        // Regroupe les jours cochés consécutifs (mêmes heures) en une seule note ; les jours isolés = 1 note chacun.
        const runs: { start: string; end: string; hours: number; days: number }[] = [];
        let cur: any = null;
        for (const d of formDays) {
          if (!d.checked || !((Number(d.hours) || 0) > 0)) { cur = null; continue; }
          if (cur && d.hours === cur.hours && isNextDayISO(cur.end, d.date)) { cur.end = d.date; cur.days++; }
          else { cur = { start: d.date, end: d.date, hours: d.hours, days: 1 }; runs.push(cur); }
        }
        const newNotes = runs.map(r => ({ date: r.start, endDate: r.end, title: title.trim(), text: text.trim(), color, kind: 'formation' as const, hours: Math.round(r.hours * r.days * 10) / 10 }));
        addNotes(newNotes);
        onClose();
        return;
      }
      const h = Number((hours || '').replace(',', '.'));
      if (!h || h <= 0) { showAlert('Heures manquantes', 'Indique le nombre d\'heures de formation.'); return; }
      const data = { date: startISO, endDate: endISO, title: title.trim(), text: text.trim(), color, kind: 'formation' as const, hours: Math.round(h * 10) / 10 };
      if (editNote) updateNote(editNote.id, data); else addNote(data);
      onClose();
      return;
    }
    if (!text.trim()) { showAlert('Note vide', 'Écris ta note (courte).'); return; }
    const data = { date: startISO, endDate: endISO, title: title.trim() || 'Note', text: text.trim(), color, kind: 'note' as const };
    if (editNote) updateNote(editNote.id, data); else addNote(data);
    onClose();
  }

  const multiDay = isForm && !editNote && iso(start) !== iso(end);
  function toggleWeekday(i: number) { setWeekdays(w => w.map((x, j) => j === i ? !x : x)); }
  function generateDays() {
    const ph = Number((perDayHours || '').replace(',', '.')) || 0;
    if (!(ph > 0)) { showAlert('Heures/jour', 'Indique les heures par jour de formation.'); return; }
    const anyWd = weekdays.some(Boolean);
    const list: { date: string; checked: boolean; hours: number }[] = [];
    const cur = new Date(start); cur.setHours(0, 0, 0, 0);
    const last = new Date(end); last.setHours(0, 0, 0, 0);
    let guard = 0;
    while (cur <= last && guard < 2000) {
      const mi = (cur.getDay() + 6) % 7; // 0 = lundi
      if (!anyWd || weekdays[mi]) list.push({ date: iso(new Date(cur)), checked: true, hours: ph });
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    if (!list.length) { showAlert('Aucun jour', 'Aucun jour ne correspond dans cette période.'); return; }
    setFormDays(list);
  }
  const fdChecked = formDays.filter(d => d.checked);
  const fdTotalH = Math.round(fdChecked.reduce((a, d) => a + (Number(d.hours) || 0), 0) * 10) / 10;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* iOS : le ScrollView utilise automaticallyAdjustKeyboardInsets, qui remonte deja le contenu au-dessus du
          clavier. Cumuler behavior="padding" faisait compenser deux fois → champ mal cadre. iOS = ScrollView seul,
          Android (qui ignore cette prop) garde behavior="height". */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
        <View style={s.overlay}>
          <View style={[s.card, { paddingBottom: 22 + insets.bottom }]}>
            <View style={s.header}>
              <Text style={[s.title, { marginBottom: 0, flex: 1, textAlign: 'left' }]}>{editNote ? (isForm ? 'Modifier la formation' : 'Modifier la note') : (isForm ? 'Ajouter une formation' : 'Note perso')}</Text>
              <TouchableOpacity style={s.close} onPress={onClose} hitSlop={8}><Text style={s.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true} contentContainerStyle={{ paddingBottom: 24 }}>
              {isForm && <Text style={s.formIntro}>Une formation compte dans tes heures, pas dans ton brut ni tes cachets.</Text>}

              <Text style={s.label}>{isForm ? 'Organisme de formation' : 'Titre de la note'}</Text>
              <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={isForm ? 'Ex : AFDAS, CFPTS, INA…' : 'Ex : RDV médecin, Congés posés…'} placeholderTextColor={C.muted} autoCapitalize={isForm ? 'characters' : 'sentences'} />
              <View style={s.chipRow}>
                {(isForm ? ORG_SUGGESTIONS : SUGGESTIONS).map(sug => (
                  <TouchableOpacity key={sug} style={s.chip} onPress={() => setTitle(sug)}>
                    <Text style={s.chipTxt}>{sug}</Text>
                  </TouchableOpacity>
                ))}
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

              {isForm && !multiDay && (<>
                <Text style={s.label}>Heures de formation</Text>
                <TextInput style={s.input} value={hours} onChangeText={setHours} keyboardType="numeric" placeholder="Ex : 35" placeholderTextColor={C.muted} />
              </>)}

              {isForm && multiDay && (
                <View style={s.mdBox}>
                  <Text style={s.label}>Jours de formation dans la période</Text>
                  <Text style={s.mdHint}>Choisis les jours qui reviennent (ex. 2 par semaine) + les heures/jour, puis « Générer ». Tu pourras décocher les exceptions (vacances, fériés). Laisse les jours vides pour tout cocher à la main.</Text>
                  <View style={s.wdRow}>
                    {WEEKDAYS_FR.map((w, i) => (
                      <TouchableOpacity key={i} style={[s.wdBtn, weekdays[i] && s.wdBtnOn]} onPress={() => toggleWeekday(i)}>
                        <Text style={[s.wdTxt, weekdays[i] && s.wdTxtOn]}>{w}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={s.mdGenRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.mdMini}>Heures / jour</Text>
                      <TextInput style={s.input} value={perDayHours} onChangeText={setPerDayHours} keyboardType="numeric" placeholder="Ex : 7" placeholderTextColor={C.muted} />
                    </View>
                    <TouchableOpacity style={s.genBtn} onPress={generateDays}><Text style={s.genBtnTxt}>Générer</Text></TouchableOpacity>
                  </View>
                  {formDays.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={s.mdSummary}>{fdChecked.length} jour{fdChecked.length > 1 ? 's' : ''} · {fdTotalH} h au total</Text>
                      {formDays.map((d, i) => (
                        <View key={d.date} style={[s.fdRow, !d.checked && { opacity: 0.45 }]}>
                          <TouchableOpacity style={s.fdLeft} onPress={() => setFormDays(arr => arr.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}>
                            <View style={[s.fdCheck, d.checked && s.fdCheckOn]}>{d.checked ? <Text style={s.fdCheckTxt}>✓</Text> : null}</View>
                            <Text style={s.fdLabel}>{new Date(d.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</Text>
                          </TouchableOpacity>
                          <TextInput style={s.fdHours} value={String(d.hours)} keyboardType="numeric" editable={d.checked} onChangeText={(v) => { const n = Number(v.replace(',', '.')) || 0; setFormDays(arr => arr.map((x, j) => j === i ? { ...x, hours: n } : x)); }} />
                          <Text style={s.fdHoursU}>h</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <Text style={s.label}>{isForm ? 'Intitulé (facultatif)' : 'Note (courte)'}</Text>
              <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} value={text} onChangeText={setText} maxLength={200} multiline placeholder={isForm ? 'Ex : Habilitation électrique…' : 'Ex : RDV dentiste 14h…'} placeholderTextColor={C.muted} />
              <Text style={s.counter}>{text.length} / 200</Text>

              <Text style={s.label}>Couleur (repère)</Text>
              <View style={s.colorRow}>
                {NOTE_PRESETS.concat(customColors).map(hex => (
                  <TouchableOpacity key={hex} style={[s.colorSw, { backgroundColor: hex }, hex.toLowerCase() === color.toLowerCase() && s.colorSwOn]} onPress={() => setColor(hex)} />
                ))}
                <TouchableOpacity style={s.colorAdd} onPress={() => setPickerOpen(true)}><Text style={s.colorAddTxt}>+</Text></TouchableOpacity>
              </View>

              {isForm && (
                <View style={s.cond}>
                  <Text style={s.condH}>À savoir</Text>
                  <Text style={s.condLi}>Les heures comptent dans tes 507 h, <Text style={s.condB}>plafonnées à 338 h</Text> (les 2/3).</Text>
                  <Text style={s.condLi}>Uniquement si tu <Text style={s.condB}>n'es pas indemnisé</Text> (ARE) pendant la formation.</Text>
                  <Text style={s.condLi}>Formation éligible (toutes les formations <Text style={s.condB}>AFDAS</Text> le sont).</Text>
                  <Text style={s.condLi}>Pense à ta <Text style={s.condB}>cessation d'inscription</Text> auprès de France Travail avant l'entrée.</Text>
                </View>
              )}

              <TouchableOpacity style={s.save} onPress={save}><Text style={s.saveTxt}>{editNote ? (isForm ? 'Modifier la formation' : 'Modifier la note') : (isForm ? 'Enregistrer la formation' : 'Enregistrer la note')}</Text></TouchableOpacity>
              <TouchableOpacity style={s.cancel} onPress={onClose}><Text style={s.cancelTxt}>Annuler</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ColorPickerModal visible={pickerOpen} initial={color} onClose={() => setPickerOpen(false)} onPick={(hex) => { setCustomColors(prev => prev.map(c => c.toLowerCase()).includes(hex.toLowerCase()) || NOTE_PRESETS.map(c => c.toLowerCase()).includes(hex.toLowerCase()) ? prev : [...prev, hex]); setColor(hex); setPickerOpen(false); }} />
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '92%' },
  title: { fontSize: 20, fontWeight: '900', color: C.petrol, marginBottom: 12, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft },
  closeTxt: { fontSize: 16, color: C.muted, fontWeight: '800' },
  formIntro: { fontSize: 12.5, color: C.muted, marginBottom: 4, lineHeight: 17 },
  cond: { marginTop: 16, backgroundColor: C.soft, borderRadius: 13, padding: 13, borderWidth: 1, borderColor: C.line },
  condH: { fontSize: 12, fontWeight: '800', color: C.petrol, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 7 },
  condLi: { fontSize: 12, color: C.muted, lineHeight: 17, marginBottom: 5 },
  condB: { color: C.text, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.card },
  inputTxt: { fontSize: 15, color: C.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 99, backgroundColor: C.soft },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: C.petrol },
  row: { flexDirection: 'row', gap: 10 },
  counter: { textAlign: 'right', fontSize: 11, color: C.muted, marginTop: 4 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  colorSw: { width: 32, height: 32, borderRadius: 9, borderWidth: 2, borderColor: 'transparent' },
  colorSwOn: { borderColor: C.text },
  colorAdd: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  colorAddTxt: { fontSize: 18, fontWeight: '800', color: C.muted, lineHeight: 20 },
  save: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelTxt: { color: C.muted, fontWeight: '700', fontSize: 14 },
  mdBox: { marginTop: 4 },
  mdHint: { fontSize: 12, color: C.muted, lineHeight: 16, marginBottom: 8 },
  wdRow: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  wdBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: C.soft, alignItems: 'center' },
  wdBtnOn: { backgroundColor: C.petrol },
  wdTxt: { fontSize: 11.5, fontWeight: '800', color: C.petrol },
  wdTxtOn: { color: '#fff' },
  mdGenRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  mdMini: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 6 },
  genBtn: { backgroundColor: C.petrol, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center' },
  genBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  mdSummary: { fontSize: 13, fontWeight: '800', color: C.petrol, backgroundColor: C.soft, borderRadius: 10, padding: 10, marginBottom: 8, overflow: 'hidden' },
  fdRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: C.line, borderRadius: 11, marginBottom: 6, backgroundColor: C.card },
  fdLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  fdCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  fdCheckOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  fdCheckTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
  fdLabel: { fontSize: 13, fontWeight: '700', color: C.text, textTransform: 'capitalize' },
  fdHours: { width: 54, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'center', fontSize: 14, color: C.text },
  fdHoursU: { fontSize: 12, color: C.muted },
});
