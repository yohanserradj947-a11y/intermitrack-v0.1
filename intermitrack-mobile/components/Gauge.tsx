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

const FORM_COLOR = '#7C3AED'; // accent formation (agrégat de la jauge uniquement, pas la couleur des formations sur le calendrier)
const ENS_COLOR = '#0EA5E9';  // accent enseignement (régime général qui compte dans les 507 h) — bleu ciel, tranche avec le pétrole et le violet

export default function Gauge({ done, planned, total, formation = 0, enseignement = 0 }:
  { done: number; planned: number; total: number; formation?: number; enseignement?: number }) {
  const C = useTheme();
  const g = useMemo(() => makeG(C), [C]);
  // Fractions pour le TRACÉ de l'arc (plafonnées à un demi-cercle plein) : effectué → formation → enseignement → prévu
  const doneP = Math.max(0, Math.min(done / total, 1));
  const formP = Math.max(0, Math.min(formation / total, 1 - doneP));
  const ensP = Math.max(0, Math.min(enseignement / total, 1 - doneP - formP));
  const planP = Math.max(0, Math.min(planned / total, 1 - doneP - formP - ensP));
  // Pourcentages AFFICHÉS : non plafonnés (peuvent dépasser 100 %)
  const donePct = Math.round((Math.max(0, done) / total) * 100);
  const planPct = Math.round((Math.max(0, planned) / total) * 100);
  const totalPct = Math.round(((Math.max(0, done) + Math.max(0, formation) + Math.max(0, enseignement) + Math.max(0, planned)) / total) * 100);
  const reached = totalPct >= 100;
  // Heures AFFICHÉES (chiffres exacts, pas que des %)
  const doneH = Math.round(Math.max(0, done));
  const planH = Math.round(Math.max(0, planned));
  const formH = Math.round(Math.max(0, formation));
  const ensH = Math.round(Math.max(0, enseignement));
  const totalH = doneH + formH + ensH + planH;

  const W = 260, H = 150, cx = 130, cy = 138, r = 108, sw = 22;

  return (
    <View style={g.wrap}>
      <View style={{ width: W, height: H, alignSelf: 'center' }}>
        <Svg width={W} height={H}>
          <Path d={arc(cx, cy, r, 0, 1)} stroke={C.track} strokeWidth={sw} fill="none" strokeLinecap="round" />
          {planP > 0 && (
            <Path d={arc(cx, cy, r, 0, doneP + formP + ensP + planP)} stroke={C.orange} strokeWidth={sw} fill="none" strokeLinecap="round" />
          )}
          {ensP > 0 && (
            <Path d={arc(cx, cy, r, 0, doneP + formP + ensP)} stroke={ENS_COLOR} strokeWidth={sw} fill="none" strokeLinecap="round" />
          )}
          {formP > 0 && (
            <Path d={arc(cx, cy, r, 0, doneP + formP)} stroke={FORM_COLOR} strokeWidth={sw} fill="none" strokeLinecap="round" />
          )}
          {doneP > 0 && (
            <Path d={arc(cx, cy, r, 0, doneP)} stroke={C.petrol} strokeWidth={sw} fill="none" strokeLinecap="round" />
          )}
        </Svg>
        <View style={g.center}>
          <Text style={[g.pct, reached && { color: C.petrol }]}>{totalPct}%</Text>
          <Text style={[g.sub, reached && { color: C.petrol, fontWeight: '800' }]}>{totalH} h / {total} h</Text>
        </View>
      </View>
      <View style={g.legends}>
        <View style={g.leg}><View style={[g.dot, { backgroundColor: C.petrol }]} /><Text style={g.legTxt} numberOfLines={1}>Effectué · {donePct}%</Text></View>
        {formation > 0 && <View style={g.leg}><View style={[g.dot, { backgroundColor: FORM_COLOR }]} /><Text style={g.legTxt} numberOfLines={1}>Formation</Text></View>}
        {enseignement > 0 && <View style={g.leg}><View style={[g.dot, { backgroundColor: ENS_COLOR }]} /><Text style={g.legTxt} numberOfLines={1}>Enseignement</Text></View>}
        <View style={g.leg}><View style={[g.dot, { backgroundColor: C.orange }]} /><Text style={g.legTxt} numberOfLines={1}>Prévu · {planPct}%</Text></View>
        <View style={g.leg}><View style={[g.dot, { backgroundColor: C.track }]} /><Text style={[g.legTxt, { color: C.muted }]} numberOfLines={1}>Restant</Text></View>
      </View>
    </View>
  );
}

const makeG = (C:any) => StyleSheet.create({
  wrap: { padding: 12 },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 },
  pct: { fontSize: 48, fontWeight: '900', color: C.petrol, letterSpacing: -2 },
  sub: { fontSize: 13, color: C.muted, marginTop: -4 },
  // Les légendes peuvent être 3 à 5 selon les cas (formation / enseignement présents ou non).
  // → centrées + retour à la ligne : elles se répartissent proprement et ne débordent jamais de la carte.
  legends: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 7, marginTop: 10 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
  legTxt: { fontSize: 11, fontWeight: '700', color: C.text, flexShrink: 1 },
});