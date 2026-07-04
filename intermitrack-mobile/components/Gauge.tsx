import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useMemo } from 'react';
import { useTheme } from '../lib/theme';

// La palette vient du thème (lib/theme) → const C = useTheme() dans le composant.

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
function arc(cx: number, cy: number, r: number, startFrac: number, endFrac: number) {
  const a0 = 180 * (1 - startFrac);
  const a1 = 180 * (1 - endFrac);
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
}

export default function Gauge({ done, planned, total }: { done: number; planned: number; total: number }) {
  const C = useTheme();
  const g = useMemo(() => makeG(C), [C]);
  // Fractions pour le TRACÉ de l'arc (plafonnées à un demi-cercle plein)
  const doneP = Math.max(0, Math.min(done / total, 1));
  const planP = Math.max(0, Math.min(planned / total, 1 - doneP));
  // Pourcentages AFFICHÉS : non plafonnés (peuvent dépasser 100 %)
  const donePct = Math.round((Math.max(0, done) / total) * 100);
  const planPct = Math.round((Math.max(0, planned) / total) * 100);
  const totalPct = Math.round(((Math.max(0, done) + Math.max(0, planned)) / total) * 100);
  const reached = totalPct >= 100;

  const W = 260, H = 150, cx = 130, cy = 138, r = 108, sw = 22;

  return (
    <View style={g.wrap}>
      <View style={{ width: W, height: H, alignSelf: 'center' }}>
        <Svg width={W} height={H}>
          <Path d={arc(cx, cy, r, 0, 1)} stroke={C.track} strokeWidth={sw} fill="none" strokeLinecap="round" />
          {planP > 0 && (
            <Path d={arc(cx, cy, r, 0, doneP + planP)} stroke={C.orange} strokeWidth={sw} fill="none" strokeLinecap="round" />
          )}
          {doneP > 0 && (
            <Path d={arc(cx, cy, r, 0, doneP)} stroke={C.petrol} strokeWidth={sw} fill="none" strokeLinecap="round" />
          )}
        </Svg>
        <View style={g.center}>
          <Text style={[g.pct, reached && { color: C.petrol }]}>{totalPct}%</Text>
          <Text style={[g.sub, reached && { color: C.petrol, fontWeight: '800' }]}>{reached ? '507 h atteint' : 'potentiel total'}</Text>
        </View>
      </View>
      <View style={g.legends}>
        <View style={g.leg}><View style={[g.dot, { backgroundColor: C.petrol }]} /><Text style={g.legTxt}>Effectué · {donePct}%</Text></View>
        <View style={g.leg}><View style={[g.dot, { backgroundColor: C.orange }]} /><Text style={g.legTxt}>Prévu · {planPct}%</Text></View>
        <View style={g.leg}><View style={[g.dot, { backgroundColor: C.track }]} /><Text style={[g.legTxt, { color: C.muted }]}>Restant</Text></View>
      </View>
    </View>
  );
}

const makeG = (C:any) => StyleSheet.create({
  wrap: { padding: 12 },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 },
  pct: { fontSize: 48, fontWeight: '900', color: C.petrol, letterSpacing: -2 },
  sub: { fontSize: 13, color: C.muted, marginTop: -4 },
  legends: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  legTxt: { fontSize: 11, fontWeight: '700', color: C.text },
});