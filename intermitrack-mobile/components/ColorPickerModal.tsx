import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import Svg, { Line, Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../lib/theme';
import { textOn, prodGradient } from '../lib/prodColors';

// Palette exacte du site (openCustomColorPicker).
const CC_PRESETS = ['#1E6FE0', '#16B1C9', '#15B86B', '#7BC62D', '#F2B705', '#FB8C00', '#F0552B', '#E0306E', '#B5179E', '#7C3AED', '#5C6BC0', '#2DBFA8', '#D85045', '#0E7E8F', '#5A6B7A', '#0D1B2A'];

function hsvToHex(h: number, sv: number, v: number) {
  h = ((h % 360) + 360) % 360;
  const c = v * sv, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
function hexToHsv(hex: string) {
  const h = (hex || '').replace('#', ''); const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h; const n = parseInt(f, 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0; if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  return [hh, mx ? d / mx : 0, mx] as [number, number, number];
}

const WHEEL = 210;
const SEGMENTS = 60;

// Roue multicolore : tape pour choisir (angle = teinte, distance au centre = saturation).
function ColorWheel({ hex, onPick }: { hex: string; onPick: (hex: string) => void }) {
  const R = WHEEL / 2;
  const wedges = Array.from({ length: SEGMENTS }, (_, i) => {
    const a0 = (i / SEGMENTS) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / SEGMENTS) * 2 * Math.PI - Math.PI / 2;
    const x0 = R + R * Math.cos(a0), y0 = R + R * Math.sin(a0);
    const x1 = R + R * Math.cos(a1), y1 = R + R * Math.sin(a1);
    return { d: `M${R} ${R} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z`, col: hsvToHex((i / SEGMENTS) * 360, 1, 1) };
  });
  function handle(x: number, y: number) {
    const dx = x - R, dy = y - R;
    let ang = Math.atan2(dy, dx) + Math.PI / 2; if (ang < 0) ang += 2 * Math.PI;
    const hue = (ang / (2 * Math.PI)) * 360;
    const sat = Math.max(0.12, Math.min(1, Math.sqrt(dx * dx + dy * dy) / R));
    onPick(hsvToHex(hue, sat, 1));
  }
  const [hh, ss] = hexToHsv(hex);
  const selAng = (hh / 360) * 2 * Math.PI - Math.PI / 2;
  const selX = R + ss * R * Math.cos(selAng), selY = R + ss * R * Math.sin(selAng);
  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e: GestureResponderEvent) => handle(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onResponderMove={(e: GestureResponderEvent) => handle(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      style={{ width: WHEEL, height: WHEEL, alignSelf: 'center' }}
    >
      <Svg width={WHEEL} height={WHEEL}>
        {wedges.map((w, i) => <Path key={i} d={w.d} fill={w.col} />)}
        <Defs>
          <RadialGradient id="sat" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#fff" stopOpacity={1} />
            <Stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={R} cy={R} r={R} fill="url(#sat)" />
        <Circle cx={selX} cy={selY} r={9} fill={hex} stroke="#fff" strokeWidth={3} />
      </Svg>
    </View>
  );
}

export default function ColorPickerModal({ visible, initial, onPick, onClose }: { visible: boolean; initial: string; onPick: (hex: string) => void; onClose: () => void }) {
  const C = useTheme();
  const [hex, setHex] = useState('#1E6FE0');
  useEffect(() => { if (visible) setHex(initial || '#1E6FE0'); }, [visible]);

  const tc = textOn(hex);
  const grad = prodGradient(hex);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={[st.card, { backgroundColor: C.card }]}>
          <Text style={[st.title, { color: C.petrol }]}>Choisir une couleur</Text>

          <View style={st.previewRow}>
            <View style={st.previewCol}>
              <View style={st.previewCell}>
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Svg width={58} height={58} style={StyleSheet.absoluteFill}>
                  {[-58, -38, -18, 2, 22, 42, 62, 82].map((x, i) => (
                    <Line key={i} x1={x} y1={0} x2={x + 58} y2={58} stroke="rgba(255,255,255,0.42)" strokeWidth={3} />
                  ))}
                </Svg>
                <Text style={{ color: tc, fontWeight: '900', fontSize: 16 }}>12</Text>
              </View>
              <Text style={[st.previewLbl, { color: C.muted }]}>Effectué</Text>
            </View>
            <View style={st.previewCol}>
              <View style={st.previewCell}>
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={{ color: tc, fontWeight: '900', fontSize: 16 }}>20</Text>
              </View>
              <Text style={[st.previewLbl, { color: C.muted }]}>À venir</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={{ color: C.muted, fontWeight: '800', fontSize: 14 }}>{hex.toUpperCase()}</Text>
            </View>
          </View>

          <View style={{ marginTop: 18 }}>
            <ColorWheel hex={hex} onPick={setHex} />
          </View>

          <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 16, marginBottom: 8, fontWeight: '700' }}>Couleurs rapides</Text>
          <View style={st.presetRow}>
            {CC_PRESETS.map(p => (
              <TouchableOpacity key={p} style={[st.preset, { backgroundColor: p }, p.toLowerCase() === hex.toLowerCase() && { borderWidth: 2, borderColor: C.text }]} onPress={() => setHex(p)} />
            ))}
          </View>

          <TouchableOpacity style={[st.validate, { backgroundColor: C.petrol }]} onPress={() => onPick(hex)}>
            <Text style={st.validateTxt}>Valider cette couleur</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.cancel} onPress={onClose}>
            <Text style={[st.cancelTxt, { color: C.muted }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 360, borderRadius: 22, padding: 22, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, elevation: 10 },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 14 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewCol: { alignItems: 'center', gap: 5 },
  previewCell: { width: 58, height: 58, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewLbl: { fontSize: 10, fontWeight: '700' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { width: 32, height: 32, borderRadius: 8 },
  validate: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  validateTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancel: { paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  cancelTxt: { fontWeight: '700', fontSize: 14 },
});
