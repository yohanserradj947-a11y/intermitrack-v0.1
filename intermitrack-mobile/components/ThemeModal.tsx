import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemeControls, THEME_META, DEFAULT_CUSTOM, type CustomSettings, type CustomTheme } from '../lib/theme';
import ColorPickerModal from './ColorPickerModal';

function lum(hex: string) {
  const h = (hex || '').replace('#', ''); const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(f, 16) || 0; return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export default function ThemeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const C = useTheme();
  const { themeId, setTheme, customs, saveCustom, deleteCustom } = useThemeControls();
  const [picker, setPicker] = useState<null | 'a' | 'b'>(null);
  const ink = (hex: string) => (lum(hex) > 0.6 ? '#0A0A0A' : '#FFFFFF');

  // L'ÉDITEUR est un mode à part : tant qu'il est ouvert, rien n'est enregistré. C'est la validation
  // qui manquait — avant, chaque clic sur une couleur appliquait et écrasait le thème unique.
  // Retour Yohan : « on le crée, il apparaît directement, mais il n'y a pas de validation ».
  const [edit, setEdit] = useState<null | { id?: string; name: string; s: CustomSettings }>(null);
  useEffect(() => { if (!visible) setEdit(null); }, [visible]); // on ne rouvre jamais sur un brouillon

  function openCreate() { setEdit({ name: '', s: { ...DEFAULT_CUSTOM } }); }
  function openEdit(t: CustomTheme) { setEdit({ id: t.id, name: t.name, s: { ...t.settings } }); }
  function confirmDelete(t: CustomTheme) {
    Alert.alert('Supprimer « ' + t.name + ' » ?', 'Ce thème sera définitivement supprimé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteCustom(t.id) },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.line }]}>
          <View style={st.head}>
            <Text style={[st.title, { color: C.petrol }]}>Thème</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ paddingBottom: 6 }}>
            <Text style={[st.eyebrow, { color: C.muted }]}>Collections</Text>
            <View style={st.grid}>
              {THEME_META.map(t => {
                const on = themeId === t.id;
                return (
                  <TouchableOpacity key={t.id} activeOpacity={0.85} onPress={() => setTheme(t.id)}
                    style={[st.tcard, { borderColor: on ? C.petrol : C.line, backgroundColor: on ? C.soft : 'transparent' }]}>
                    <View style={[st.swatch, { backgroundColor: t.colors[2] }]}>
                      <View style={[st.dot, { backgroundColor: t.colors[0], left: 12 }]} />
                      <View style={[st.dot, { backgroundColor: t.colors[1], right: 12 }]} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                      <Text style={[st.tlabel, { color: C.text }]} numberOfLines={1}>{t.label}</Text>
                      {on && <Ionicons name="checkmark-circle" size={15} color={C.petrol} />}
                    </View>
                    <Text style={[st.premium, { color: t.premium ? C.muted : 'transparent' }]}>Premium</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* MES THÈMES : la bibliothèque, à côté des thèmes de base. On les retrouve, on en change
                librement, ils ne disparaissent plus quand on passe sur Rock. */}
            <Text style={[st.eyebrow, { color: C.muted, marginTop: 18 }]}>Mes thèmes</Text>
            <View style={st.grid}>
              {customs.map(t => {
                const on = themeId === `custom:${t.id}`;
                return (
                  <TouchableOpacity key={t.id} activeOpacity={0.85} onPress={() => setTheme(`custom:${t.id}`)}
                    onLongPress={() => confirmDelete(t)}
                    style={[st.tcard, { borderColor: on ? C.petrol : C.line, backgroundColor: on ? C.soft : 'transparent' }]}>
                    <View style={[st.swatch, { backgroundColor: t.settings.base === 'dark' ? '#1A2329' : '#FFFFFF' }]}>
                      <View style={[st.dot, { backgroundColor: t.settings.accent, left: 12 }]} />
                      <View style={[st.dot, { backgroundColor: t.settings.accent2, right: 12 }]} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                      <Text style={[st.tlabel, { color: C.text }]} numberOfLines={1}>{t.name}</Text>
                      {on && <Ionicons name="checkmark-circle" size={15} color={C.petrol} />}
                    </View>
                    <TouchableOpacity onPress={() => openEdit(t)} hitSlop={8}>
                      <Text style={[st.premium, { color: C.petrol }]}>Modifier</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
              {/* Créer : même forme que les autres tuiles, pour que ce soit évident. */}
              <TouchableOpacity activeOpacity={0.85} onPress={openCreate}
                style={[st.tcard, { borderColor: C.line, borderStyle: 'dashed', justifyContent: 'center' }]}>
                <View style={[st.swatch, { backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="add" size={24} color={C.petrol} />
                </View>
                <Text style={[st.tlabel, { color: C.petrol, marginTop: 8 }]} numberOfLines={1}>Créer</Text>
                <Text style={[st.premium, { color: 'transparent' }]}>.</Text>
              </TouchableOpacity>
            </View>
            {customs.length > 0 && (
              <Text style={[st.customSub, { color: C.muted, marginTop: 8 }]}>Appui long sur un thème pour le supprimer.</Text>
            )}
          </ScrollView>
        </View>
      </View>

      {/* ÉDITEUR — rien n'est enregistré tant qu'on n'a pas nommé et validé. Annuler ne laisse aucune trace. */}
      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <View style={st.overlay}>
          <View style={[st.card, { backgroundColor: C.card, borderColor: C.line }]}>
            <View style={st.head}>
              <Text style={[st.title, { color: C.petrol }]}>{edit?.id ? 'Modifier le thème' : 'Nouveau thème'}</Text>
              <TouchableOpacity onPress={() => setEdit(null)} hitSlop={10}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
            </View>

            {edit && (<>
              <Text style={[st.customSub, { color: C.muted, marginTop: 0 }]}>Donne-lui un nom : tu le retrouveras à côté des autres thèmes.</Text>
              <TextInput
                style={[st.nameInput, { borderColor: C.line, color: C.text, backgroundColor: C.bg }]}
                value={edit.name} onChangeText={(t) => setEdit({ ...edit, name: t })}
                placeholder="Ex : Mon bleu nuit" placeholderTextColor={C.muted} maxLength={24}
              />

              {/* Aperçu : on doit voir ce qu'on fait, sans que ce soit appliqué à l'appli pour autant. */}
              <View style={[st.preview, { backgroundColor: edit.s.base === 'dark' ? '#1A2329' : '#FFFFFF', borderColor: C.line }]}>
                <View style={[st.previewBar, { backgroundColor: edit.s.accent }]} />
                <View style={[st.previewBar, { backgroundColor: edit.s.accent2, width: '45%' }]} />
                <Text style={{ color: edit.s.base === 'dark' ? '#DCF0FA' : '#0D1B2A', fontSize: 12, fontWeight: '800', marginTop: 6 }}>Aperçu</Text>
              </View>

              <TouchableOpacity style={[st.pickRow, { borderColor: C.line }]} onPress={() => setPicker('a')} activeOpacity={0.85}>
                <View style={[st.pickSw, { backgroundColor: edit.s.accent }]} />
                <Text style={[st.pickTxt, { color: C.text }]}>Couleur principale</Text>
                <Ionicons name="color-wand-outline" size={16} color={C.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={[st.pickRow, { borderColor: C.line }]} onPress={() => setPicker('b')} activeOpacity={0.85}>
                <View style={[st.pickSw, { backgroundColor: edit.s.accent2 }]} />
                <Text style={[st.pickTxt, { color: C.text }]}>Couleur secondaire</Text>
                <Ionicons name="color-wand-outline" size={16} color={C.muted} />
              </TouchableOpacity>

              <View style={st.baseRow}>
                {(['light', 'dark'] as const).map(b => {
                  const on = edit.s.base === b;
                  return (
                    <TouchableOpacity key={b} onPress={() => setEdit({ ...edit, s: { ...edit.s, base: b } })} activeOpacity={0.85}
                      style={[st.baseBtn, { borderColor: on ? C.petrol : C.line, backgroundColor: on ? C.soft : 'transparent' }]}>
                      <Text style={{ color: on ? C.petrol : C.muted, fontWeight: '800', fontSize: 12.5 }}>{b === 'light' ? 'Fond clair' : 'Fond sombre'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity style={[st.baseBtn, { borderColor: C.line, paddingVertical: 14 }]} onPress={() => setEdit(null)} activeOpacity={0.85}>
                  <Text style={{ color: C.muted, fontWeight: '800', fontSize: 14 }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.apply, { backgroundColor: C.petrol, flex: 1, marginTop: 0 }]} activeOpacity={0.9}
                  onPress={() => { saveCustom(edit.name, edit.s, edit.id); setEdit(null); }}>
                  <Ionicons name="checkmark" size={17} color={ink(C.petrol)} />
                  <Text style={[st.applyTxt, { color: ink(C.petrol) }]}>Enregistrer et appliquer</Text>
                </TouchableOpacity>
              </View>
            </>)}
          </View>
        </View>
      </Modal>

      <ColorPickerModal
        visible={picker !== null}
        initial={picker === 'a' ? (edit?.s.accent ?? DEFAULT_CUSTOM.accent) : (edit?.s.accent2 ?? DEFAULT_CUSTOM.accent2)}
        onPick={(hex) => { if (edit) setEdit({ ...edit, s: picker === 'a' ? { ...edit.s, accent: hex } : { ...edit.s, accent2: hex } }); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, borderRadius: 24, borderWidth: 1, padding: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, elevation: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '900' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tcard: { width: '31%', flexGrow: 1, minWidth: 96, borderWidth: 1.5, borderRadius: 15, padding: 9, alignItems: 'center' },
  swatch: { width: '100%', height: 44, borderRadius: 10, position: 'relative', overflow: 'hidden' },
  dot: { position: 'absolute', top: 15, width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.55)' },
  tlabel: { fontSize: 12.5, fontWeight: '800' },
  premium: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  rowLabel: { fontSize: 14, fontWeight: '700' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 11, padding: 3, gap: 3 },
  segBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
  customBox: { marginTop: 16, borderWidth: 1.5, borderRadius: 18, padding: 15 },
  customTitle: { fontSize: 15.5, fontWeight: '900' },
  customSub: { fontSize: 12.5, marginTop: 3, marginBottom: 13 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 11, marginBottom: 9 },
  pickSw: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,.15)' },
  pickTxt: { flex: 1, fontSize: 13.5, fontWeight: '800' },
  baseRow: { flexDirection: 'row', gap: 10, marginTop: 2, marginBottom: 4 },
  baseBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  apply: { flexDirection: 'row', gap: 7, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  applyTxt: { fontWeight: '900', fontSize: 15 },
  nameInput: { borderWidth: 1.5, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  preview: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 13, gap: 6 },
  previewBar: { height: 9, borderRadius: 5, width: '70%' },
});
