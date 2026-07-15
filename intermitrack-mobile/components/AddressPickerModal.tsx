import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../lib/theme';
import AddressInput from './AddressInput';
import { Ionicons } from '@expo/vector-icons';
import type { Addr } from '../lib/kmAddresses';

// Pop-up de choix d'adresse pour les frais kilométriques.
// Même principe que ProductionPickerModal : les adresses déjà saisies sont proposées, de la plus
// utilisée à la moins utilisée. Le domicile remonte donc tout seul en tête pour le départ.
// Retours JB et second utilisateur : « la tâche est surtout redondante pour le lieu de départ,
// qui est généralement le domicile de l'intermittent ».
//
// Choisir une adresse connue réutilise ses COORDONNÉES mémorisées → distance calculée sans
// réinterroger l'API Adresse. Taper une nouvelle adresse passe par AddressInput (géocodage en direct).
export default function AddressPickerModal({
  visible, addresses, current, onPick, onClose, title,
}: {
  visible: boolean;
  addresses: Addr[];
  current: string;
  onPick: (label: string, coords: number[] | null) => void;
  onClose: () => void;
  title: string;
}) {
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const [q, setQ] = useState('');
  const [qCoords, setQCoords] = useState<number[] | null>(null);

  // À chaque ouverture on repart d'une saisie vide, sinon on retrouverait la recherche précédente.
  useEffect(() => { if (visible) { setQ(''); setQCoords(null); } }, [visible]);

  const query = q.trim().toLowerCase();
  const list = query ? addresses.filter(a => a.label.toLowerCase().includes(query)) : addresses;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Aucun ScrollView ici n'a automaticallyAdjustKeyboardInsets : c'est donc le KeyboardAvoidingView
          qui doit gérer le clavier (behavior="padding" sur iOS), sinon il recouvrirait la liste. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={s.box} activeOpacity={1} onPress={() => {}}>
            <View style={s.head}>
              <Text style={s.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
            </View>

            {/* Nouvelle adresse : suggestions en direct de l'API Adresse, coordonnées exactes. */}
            <AddressInput
              style={s.input}
              value={q}
              onChangeText={setQ}
              onCoords={setQCoords}
              placeholder="Chercher une nouvelle adresse…"
            />

            {!!q.trim() && (<>
              <TouchableOpacity style={s.useBtn} onPress={() => onPick(q.trim(), qCoords)}>
                <Ionicons name="checkmark-circle-outline" size={17} color="#fff" />
                <Text style={s.useTxt} numberOfLines={1}>Ajouter « {q.trim()} »</Text>
              </TouchableOpacity>
              {/* Sans coordonnées, l'adresse ne sera ni mémorisée ni utilisable pour la distance.
                  Le dire ici évite qu'on se demande pourquoi elle ne revient jamais dans la liste. */}
              {!qCoords && (
                <Text style={s.warnTxt}>
                  Choisis plutôt une suggestion ci-dessus : sans elle, la distance ne pourra pas être
                  calculée et l'adresse ne sera pas mémorisée pour tes prochaines missions.
                </Text>
              )}
            </>)}

            {list.length > 0 ? (
              <>
                <Text style={s.groupLbl}>{query ? 'Correspondances' : 'Tes adresses · de la plus utilisée à la moins utilisée'}</Text>
                <ScrollView style={s.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {list.map(a => (
                    <TouchableOpacity key={a.label} style={[s.item, a.label === current && s.itemOn]} onPress={() => onPick(a.label, a.coords)}>
                      <Ionicons name="location-outline" size={14} color={a.label === current ? '#fff' : C.petrol} />
                      <Text style={[s.itemTxt, a.label === current && s.itemTxtOn]} numberOfLines={2}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              !q.trim() && (
                <Text style={s.empty}>
                  Aucune adresse enregistrée pour l'instant. Tape la tienne ci-dessus et choisis-la
                  dans les suggestions : elle te sera proposée automatiquement les prochaines fois.
                </Text>
              )
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
  title: { fontSize: 17, fontWeight: '900', color: C.text, flexShrink: 1 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.bg },
  useBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: C.petrol },
  useTxt: { color: '#fff', fontWeight: '800', fontSize: 14, flexShrink: 1 },
  groupLbl: { fontSize: 11, fontWeight: '800', color: C.muted, marginTop: 14, marginBottom: 6 },
  list: { flexGrow: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 11, marginBottom: 6, backgroundColor: C.soft },
  itemOn: { backgroundColor: C.petrol },
  itemTxt: { fontSize: 14, fontWeight: '700', color: C.petrol, flexShrink: 1 },
  itemTxtOn: { color: '#fff' },
  empty: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 18, lineHeight: 19 },
  warnTxt: { fontSize: 12, color: C.orange, marginTop: 7, lineHeight: 17, fontWeight: '600' },
});
