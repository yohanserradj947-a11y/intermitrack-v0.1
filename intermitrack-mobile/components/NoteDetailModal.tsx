import { showAlert } from '../lib/dialog';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { useNotes, Note } from '../lib/notes';

function fmtDate(d: string) { if (!d) return ''; return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtPeriod(s: string, e: string) { if (!e || e === s) return fmtDate(s); return fmtDate(s) + ' → ' + fmtDate(e); }

export default function NoteDetailModal({ note, onClose, onEdit }: { note: Note | null; onClose: () => void; onEdit: (n: Note) => void }) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const s = makeS(C);
  const { deleteNote } = useNotes();

  function confirmDelete() {
    if (!note) return;
    showAlert('Supprimer cette note ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => { deleteNote(note.id); onClose(); } },
    ]);
  }

  return (
    <Modal visible={!!note} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.card, { paddingBottom: 22 + insets.bottom }]}>
          <TouchableOpacity onPress={onClose} style={s.back}><Text style={s.backTxt}>‹ Retour</Text></TouchableOpacity>
          <View style={s.head}>
            <View style={[s.dot, { backgroundColor: note?.color || '#1E6FE0' }]} />
            <Text style={s.title}>{note?.title || 'Note'}</Text>
          </View>
          <Text style={s.dates}>{note ? fmtPeriod(note.date, note.endDate) : ''}</Text>
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            <Text style={s.text}>{note?.text || ''}</Text>
          </ScrollView>
          <View style={s.actions}>
            <TouchableOpacity style={s.edit} onPress={() => note && onEdit(note)}><Text style={s.editTxt}>Modifier</Text></TouchableOpacity>
            <TouchableOpacity style={s.del} onPress={confirmDelete}><Text style={s.delTxt}>Supprimer</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '90%' },
  back: { paddingVertical: 4, marginBottom: 12 },
  backTxt: { fontSize: 14, fontWeight: '700', color: C.muted },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  dot: { width: 16, height: 16, borderRadius: 5 },
  title: { fontSize: 20, fontWeight: '900', color: C.petrol, flex: 1 },
  dates: { fontSize: 12.5, color: C.muted, fontWeight: '600', marginBottom: 16 },
  text: { fontSize: 15, lineHeight: 24, color: C.text, backgroundColor: C.soft, borderRadius: 14, padding: 14, minHeight: 60 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  edit: { flex: 1, paddingVertical: 13, borderWidth: 1, borderColor: C.line, borderRadius: 13, alignItems: 'center' },
  editTxt: { color: C.petrol, fontWeight: '800', fontSize: 14 },
  del: { flex: 1, paddingVertical: 13, borderRadius: 13, alignItems: 'center', backgroundColor: 'rgba(220,38,38,.12)' },
  delTxt: { color: C.danger, fontWeight: '800', fontSize: 14 },
});
