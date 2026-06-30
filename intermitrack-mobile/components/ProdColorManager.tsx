import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { useProdColors, prodGradient, textOn } from '../lib/prodColors';
import ColorPickerModal from './ColorPickerModal';

// Dégradés par défaut (sans couleur perso) = pétrole/orange, comme les cases du calendrier.
const DEF_PAST: readonly [string, string] = ['#1F4E5F', '#2F8F6B'];
const DEF_FUT: readonly [string, string] = ['#F97316', '#FDBA74'];

function PreviewCell({ hex, past, label, C }: { hex: string | null; past: boolean; label: string; C: any }) {
  const grad = hex ? prodGradient(hex) : (past ? DEF_PAST : DEF_FUT);
  const tc = hex ? textOn(hex) : '#fff';
  const hach = past && !!hex;
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <View style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {hach && <Svg width={42} height={42} style={StyleSheet.absoluteFill}>{[-42, -26, -10, 6, 22, 38, 54].map((x, i) => <Line key={i} x1={x} y1={0} x2={x + 42} y2={42} stroke="rgba(255,255,255,0.32)" strokeWidth={2.5} />)}</Svg>}
        <Text style={{ color: tc, fontWeight: '800', fontSize: 13 }}>{past ? '12' : '20'}</Text>
      </View>
      <Text style={{ fontSize: 8, fontWeight: '700', color: C.muted }}>{label}</Text>
    </View>
  );
}

export default function ProdColorManager({ visible, productions, onClose }: { visible: boolean; productions: string[]; onClose: () => void }) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const { getColor, setColor, addCustom } = useProdColors();
  const [pickProd, setPickProd] = useState<string | null>(null);

  return (
    <>
      <Modal visible={visible && !pickProd} transparent animationType="slide" onRequestClose={onClose}>
        <View style={st.overlay}>
          <View style={[st.box, { backgroundColor: C.card, paddingBottom: 22 + insets.bottom }]}>
            <Text style={[st.title, { color: C.petrol }]}>Couleurs des productions</Text>
            <Text style={[st.sub, { color: C.muted }]}>Choisis une couleur par production. Elle s&apos;applique partout : calendrier, missions et graphique.</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {productions.length === 0
                ? <Text style={{ color: C.muted, paddingVertical: 14 }}>Aucune production enregistrée pour l&apos;instant.</Text>
                : productions.map(p => {
                  const hex = getColor(p);
                  return (
                    <View key={p} style={[st.row, { borderColor: C.line }]}>
                      <Text style={[st.name, { color: C.text }]} numberOfLines={1}>{p}</Text>
                      <View style={st.rowBottom}>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <PreviewCell hex={hex} past={true} label="effectué" C={C} />
                          <PreviewCell hex={hex} past={false} label="à venir" C={C} />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity style={[st.pick, { backgroundColor: C.soft }]} onPress={() => setPickProd(p)}><Text style={{ color: C.petrol, fontWeight: '800', fontSize: 13 }}>Choisir</Text></TouchableOpacity>
                          <TouchableOpacity style={[st.def, { backgroundColor: C.soft }]} onPress={() => setColor(p, null)}><Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>défaut</Text></TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </ScrollView>
            <TouchableOpacity style={[st.close, { backgroundColor: C.petrol }]} onPress={onClose}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ColorPickerModal visible={!!pickProd} initial={(pickProd && getColor(pickProd)) || '#1E6FE0'} onClose={() => setPickProd(null)} onPick={(hex) => { if (pickProd) { addCustom(hex); setColor(pickProd, hex); } setPickProd(null); }} />
    </>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  box: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '90%' },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 4 },
  sub: { fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
  row: { paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: '800' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  pick: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 9, alignItems: 'center' },
  def: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 9, alignItems: 'center' },
  close: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
});
