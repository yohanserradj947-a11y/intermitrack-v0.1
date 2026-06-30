import { showAlert } from '../lib/dialog';
import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeControls } from '../lib/theme';
import { useNotes, Note, NOTE_PRESETS } from '../lib/notes';
import ColorPickerModal from './ColorPickerModal';

const SUGGESTIONS = ['Médical', 'Perso', 'Vacances', 'Repos', 'Autres'];
function iso(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

export default function NoteFormModal({ visible, editNote, defaultDate, onClose }: { visible: boolean; editNote: Note | null; defaultDate: string; onClose: () => void }) {
  const C = useTheme();
  const { scheme } = useThemeControls();
  const s = makeS(C);
  const insets = useSafeAreaInsets();
  const { addNote, updateNote } = useNotes();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [color, setColor] = useState(NOTE_PRESETS[0]);
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (editNote) {
      setTitle(editNote.title || '');
      setText(editNote.text || '');
      setStart(new Date((editNote.date) + 'T00:00:00'));
      setEnd(new Date((editNote.endDate || editNote.date) + 'T00:00:00'));
      setColor(editNote.color || NOTE_PRESETS[0]);
    } else {
      const d = defaultDate ? new Date(defaultDate + 'T00:00:00') : new Date();
      setTitle(''); setText(''); setStart(d); setEnd(d); setColor(NOTE_PRESETS[0]);
    }
  }, [visible]);

  function save() {
    if (!text.trim()) { showAlert('Note vide', 'Écris ta note (courte).'); return; }
    const startISO = iso(start), endISO = iso(end);
    if (endISO < startISO) { showAlert('Dates', 'La date de fin ne peut pas être avant le début.'); return; }
    const data = { date: startISO, endDate: endISO, title: title.trim() || 'Note', text: text.trim(), color };
    if (editNote) updateNote(editNote.id, data); else addNote(data);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.overlay}>
          <View style={[s.card, { paddingBottom: 22 + insets.bottom }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.title}>{editNote ? 'Modifier la note' : 'Note perso'}</Text>

              <Text style={s.label}>Titre de la note</Text>
              <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Ex : RDV médecin, Congés posés…" placeholderTextColor={C.muted} />
              <View style={s.chipRow}>
                {SUGGESTIONS.map(sug => (
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
              {showStart && <DateTimePicker value={start} mode="date" themeVariant={scheme} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setShowStart(false); if (d) { setStart(d); if (d > end) setEnd(d); } }} />}
              {showEnd && <DateTimePicker value={end} mode="date" themeVariant={scheme} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setShowEnd(false); if (d) setEnd(d); }} />}

              <Text style={s.label}>Note (courte)</Text>
              <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} value={text} onChangeText={setText} maxLength={200} multiline placeholder="Ex : RDV dentiste 14h…" placeholderTextColor={C.muted} />
              <Text style={s.counter}>{text.length} / 200</Text>

              <Text style={s.label}>Couleur (repère)</Text>
              <View style={s.colorRow}>
                {NOTE_PRESETS.concat(customColors).map(hex => (
                  <TouchableOpacity key={hex} style={[s.colorSw, { backgroundColor: hex }, hex.toLowerCase() === color.toLowerCase() && s.colorSwOn]} onPress={() => setColor(hex)} />
                ))}
                <TouchableOpacity style={s.colorAdd} onPress={() => setPickerOpen(true)}><Text style={s.colorAddTxt}>+</Text></TouchableOpacity>
              </View>

              <TouchableOpacity style={s.save} onPress={save}><Text style={s.saveTxt}>{editNote ? 'Modifier la note' : 'Enregistrer la note'}</Text></TouchableOpacity>
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
});
