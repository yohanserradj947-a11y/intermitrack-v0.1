import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../lib/theme';
import TxtInput from './TxtInput';
import { Ionicons } from '@expo/vector-icons';

// Pop-up de choix de la production / employeur.
// Un seul composant, utilise par le calendrier, les missions et le dashboard : ces 3 ecrans avaient
// chacun leur propre champ, d'ou les ecarts. Ici, un seul comportement pour tout le monde.
//
// `productions` arrive DEJA triee de la plus utilisee a la moins utilisee (voir prodCounts dans les ecrans).
export default function ProductionPickerModal({
  visible, productions, current, onPick, onClose, label = 'Production',
  plural = 'productions', autoCap = 'characters',
}: {
  visible: boolean;
  productions: string[];
  current: string;
  onPick: (name: string) => void;
  onClose: () => void;
  label?: string;
  plural?: string;                                     // « productions » / « émissions » / « lieux »
  autoCap?: 'characters' | 'none' | 'sentences';       // lieux en minuscules, prod/émission en MAJ
}) {
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const [q, setQ] = useState('');

  // A chaque ouverture on repart d'une recherche vide, sinon on retrouverait le filtre precedent.
  useEffect(() => { if (visible) setQ(''); }, [visible]);

  // En mode « lieu » on ne force pas les majuscules : la comparaison se fait donc en insensible à la casse.
  const raw = q.trim();
  const query = autoCap === 'characters' ? raw.toUpperCase() : raw;
  const list = query ? productions.filter(p => p.toUpperCase().includes(query.toUpperCase())) : productions;
  // On ne propose la creation que si le nom tape n'existe pas deja a l'identique (casse ignorée).
  const canCreate = !!query && !productions.some(p => p.toUpperCase() === query.toUpperCase());

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Ici, contrairement aux formulaires mission/note, AUCUN ScrollView n'a automaticallyAdjustKeyboardInsets :
          c'est donc le KeyboardAvoidingView qui doit gerer le clavier, avec "padding" sur iOS. Le mettre a
          undefined (comme dans ces formulaires) laisserait le clavier recouvrir la liste.
          La fenetre etant centree et bornee en hauteur, le padding la remonte ET la retrecit : le champ de
          saisie du haut reste visible et la liste continue de defiler sous lui. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={s.box} activeOpacity={1} onPress={() => {}}>
            <View style={s.head}>
              <Text style={s.title}>{label}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
            </View>

            <TxtInput style={s.input} value={q} onChangeText={setQ} placeholder="Chercher ou créer…" placeholderTextColor={C.muted} autoCapitalize={autoCap} />

            {canCreate && (
              <TouchableOpacity style={s.createBtn} onPress={() => onPick(query)}>
                <Ionicons name="add-circle-outline" size={17} color="#fff" />
                <Text style={s.createTxt} numberOfLines={1}>Créer « {query} »</Text>
              </TouchableOpacity>
            )}

            {list.length > 0 ? (
              <>
                <Text style={s.groupLbl}>{query ? 'Correspondances' : `Tes ${plural} · de la plus utilisée à la moins utilisée`}</Text>
                {/* Liste scrollable : elle peut etre longue quand on a rempli une annee entiere. */}
                <ScrollView style={s.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {list.map(p => (
                    <TouchableOpacity key={p} style={[s.item, p === current && s.itemOn]} onPress={() => onPick(p)}>
                      <Ionicons name="repeat" size={14} color={p === current ? '#fff' : C.petrol} />
                      <Text style={[s.itemTxt, p === current && s.itemTxtOn]} numberOfLines={1}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              !canCreate && <Text style={s.empty}>Rien d'enregistré pour l'instant. Tape un nom pour l'ajouter.</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { width: '100%', maxWidth: 460, maxHeight: '80%', backgroundColor: C.card, borderRadius: 20, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '900', color: C.text },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.bg },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: C.petrol },
  createTxt: { color: '#fff', fontWeight: '800', fontSize: 14, flexShrink: 1 },
  groupLbl: { fontSize: 11, fontWeight: '800', color: C.muted, marginTop: 14, marginBottom: 6 },
  list: { flexGrow: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 11, marginBottom: 6, backgroundColor: C.soft },
  itemOn: { backgroundColor: C.petrol },
  itemTxt: { fontSize: 15, fontWeight: '700', color: C.petrol, flexShrink: 1 },
  itemTxtOn: { color: '#fff' },
  empty: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 18, lineHeight: 19 },
});
