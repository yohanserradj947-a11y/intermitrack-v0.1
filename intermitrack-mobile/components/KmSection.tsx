import { showAlert } from "../lib/dialog";
import { forwardRef, useImperativeHandle, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AddressInput from './AddressInput';
import NumInput from './NumInput';

const C = { petrol: '#1F4E5F', text: '#2D3748', muted: '#718096', line: '#E2E8F0', soft: '#EEF4F1', orange: '#F97316' };

// Barème kilométrique officiel (coefficient €/km par tranche de km annuels).
const BAREME = [
  { key: '3', label: '3 CV', c1: 0.529, c2: 0.316, c3: 0.370 },
  { key: '4', label: '4 CV', c1: 0.606, c2: 0.340, c3: 0.407 },
  { key: '5', label: '5 CV', c1: 0.636, c2: 0.357, c3: 0.427 },
  { key: '6', label: '6 CV', c1: 0.665, c2: 0.374, c3: 0.447 },
  { key: '7', label: '7+ CV', c1: 0.697, c2: 0.394, c3: 0.470 },
  { key: 'moto', label: 'Moto', c1: 0.395, c2: 0.099, c3: 0.234 },
];
const TRANCHE_OPTIONS = [{ key: '1', label: '≤5 000 km/an' }, { key: '2', label: '5 001–20 000' }, { key: '3', label: '>20 000' }];
export function pf(v: string) { const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : 0; }
function kmCoef(cvKey: string, tranche: string) { const b = BAREME.find((x) => x.key === cvKey); if (!b) return 0; return tranche === '2' ? b.c2 : tranche === '3' ? b.c3 : b.c1; }
function trancheLabel(t: string) { return t === '2' ? '5 001–20 000 km/an' : t === '3' ? '> 20 000 km/an' : '≤ 5 000 km/an'; }
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) { const R = 6371, tr = (d: number) => d * Math.PI / 180; const dLat = tr(lat2 - lat1), dLon = tr(lon2 - lon1); const x = Math.sin(dLat / 2) ** 2 + Math.cos(tr(lat1)) * Math.cos(tr(lat2)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
const money = (n: number) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export type KmValues = { km_distance: number; km_rate: number; km_amount: number };
export type KmHandle = { values: (nbDays: number) => KmValues };

// Section "Frais kilométriques" réutilisable. nbDays = jours travaillés (pour ×jours).
// Le parent récupère les valeurs via ref.current.values(nbDays).
const KmSection = forwardRef<KmHandle, { nbDays: number; initialDistance?: number; initialRate?: number }>(
  ({ nbDays, initialDistance, initialRate }, ref) => {
    const [open, setOpen] = useState(!!(initialDistance));
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [fromC, setFromC] = useState<number[] | null>(null);
    const [toC, setToC] = useState<number[] | null>(null);
    const [rt, setRt] = useState(false);
    const [everyDay, setEveryDay] = useState(false);
    const [justify, setJustify] = useState(false);
    const [cv, setCv] = useState('');
    const [tranche, setTranche] = useState('1');
    const [distance, setDistance] = useState(initialDistance ? String(initialDistance) : '');
    const [rate, setRate] = useState(initialRate ? String(initialRate) : '');
    const [calc, setCalc] = useState(false);

    // Plafond domicile-travail : 40 km par trajet, sauf justification.
    const kmBase = () => justify ? pf(distance) : Math.min(pf(distance), 40);
    function valuesFor(nb: number): KmValues {
      const eff = kmBase() * (rt ? 2 : 1) * (everyDay ? Math.max(1, nb) : 1);
      const frais = cv ? eff * kmCoef(cv, tranche) : pf(rate) * eff;
      return { km_distance: Math.round(eff), km_rate: pf(rate), km_amount: Math.round(frais * 100) / 100 };
    }
    useImperativeHandle(ref, () => ({ values: valuesFor }));

    const eff = kmBase() * (rt ? 2 : 1) * (everyDay ? Math.max(1, nbDays) : 1);
    const frais = cv ? eff * kmCoef(cv, tranche) : pf(rate) * eff;

    async function doCalc() {
      if (!from.trim() || !to.trim()) { showAlert('Adresses manquantes', "Indique le lieu de départ et d'arrivée."); return; }
      setCalc(true);
      try {
        const geo = async (q: string) => { const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q)); const j = await r.json(); if (!j.features || !j.features.length) throw new Error('Adresse introuvable : ' + q); return j.features[0].geometry.coordinates; };
        const a = fromC || await geo(from), b = toC || await geo(to);
        let km: number | null = null;
        try { const rr = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false`); const rj = await rr.json(); if (rj.routes && rj.routes[0]) km = rj.routes[0].distance / 1000; } catch {}
        if (km == null) km = haversineKm(a[1], a[0], b[1], b[0]) * 1.3;
        setDistance(String(Math.round(km)));
      } catch (e: any) { showAlert('Erreur', e?.message || 'Impossible de calculer la distance.'); }
      finally { setCalc(false); }
    }

    return (
      <>
        <TouchableOpacity style={s.head} onPress={() => setOpen((o) => !o)}>
          <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="car-outline" size={13} color={C.petrol} /><Text style={s.headTxt}>Frais kilométriques (optionnel)</Text></View>
          <Text style={s.chevron}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {open && (
          <View style={{ marginTop: 6 }}>
            <Text style={s.label}>Lieu de départ</Text>
            <AddressInput style={s.input} value={from} onChangeText={setFrom} onCoords={setFromC} placeholder="Ville / adresse de départ" />
            <Text style={s.label}>Lieu d'arrivée</Text>
            <AddressInput style={s.input} value={to} onChangeText={setTo} onCoords={setToC} placeholder="Ville / adresse d'arrivée" />
            <TouchableOpacity style={s.check} onPress={() => setRt((v) => !v)}>
              <View style={[s.box, rt && s.boxOn]}>{rt && <Text style={s.boxTxt}>✓</Text>}</View>
              <Text style={s.checkTxt}>Aller-retour (×2)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.check} onPress={() => setEveryDay((v) => !v)}>
              <View style={[s.box, everyDay && s.boxOn]}>{everyDay && <Text style={s.boxTxt}>✓</Text>}</View>
              <Text style={s.checkTxt}>Trajet chaque jour travaillé (× nb jours)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.check} onPress={() => setJustify((v) => !v)}>
              <View style={[s.box, justify && s.boxOn]}>{justify && <Text style={s.boxTxt}>✓</Text>}</View>
              <Text style={s.checkTxt}>Je justifie un trajet de plus de 40 km</Text>
            </TouchableOpacity>
            {(!justify && pf(distance) > 40) ? <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="warning-outline" size={13} color={C.orange} /><Text style={[s.hint, { color: C.orange, fontWeight: '700', flex: 1 }]}>Trajet plafonné à 40 km (règle domicile-travail). Coche ci-dessus si tu peux justifier la distance réelle.</Text></View> : null}
            <TouchableOpacity style={s.calcBtn} onPress={doCalc} disabled={calc}>
              {calc ? <Text style={s.calcTxt}>Calcul…</Text> : <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="location-outline" size={13} color={C.petrol} /><Text style={s.calcTxt}>Calculer la distance</Text></View>}
            </TouchableOpacity>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Kilomètres</Text>
                <NumInput style={s.input} value={distance} onChangeText={setDistance} placeholder="0" placeholderTextColor={C.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Taux €/km (manuel)</Text>
                <NumInput style={[s.input, cv ? { opacity: 0.5 } : null]} value={rate} onChangeText={(t: string) => { setRate(t); if (t) setCv(''); }} placeholder="sinon choisis CV" placeholderTextColor={C.muted} />
              </View>
            </View>
            <Text style={s.label}>Puissance fiscale</Text>
            <View style={s.chips}>
              {BAREME.map((o) => (
                <TouchableOpacity key={o.key} style={[s.chip, cv === o.key && s.chipOn]} onPress={() => setCv((c) => c === o.key ? '' : o.key)}><Text style={cv === o.key ? s.chipTxtOn : s.chipTxt}>{o.label}</Text></TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Tes km parcourus par an (environ)</Text>
            <View style={s.chips}>
              {TRANCHE_OPTIONS.map((o) => (
                <TouchableOpacity key={o.key} style={[s.chip, tranche === o.key && s.chipOn]} onPress={() => setTranche(o.key)}><Text style={tranche === o.key ? s.chipTxtOn : s.chipTxt}>{o.label}</Text></TouchableOpacity>
              ))}
            </View>
            {(eff > 0 && !cv && pf(rate) <= 0)
              ? <Text style={[s.hint, { color: C.orange, fontWeight: '700' }]}>Choisis ta puissance fiscale (ou un taux €/km) pour estimer les frais.</Text>
              : <View style={s.result}>
                  <Text style={s.resultLine}>Distance comptée : <Text style={{ fontWeight: '900' }}>{Math.round(eff)} km</Text>{(rt || everyDay || (!justify && pf(distance) > 40)) ? `  =  ${Math.round(kmBase())} km${(!justify && pf(distance) > 40) ? ' (plafond 40)' : ''}${rt ? ' × 2 (A/R)' : ''}${everyDay ? ` × ${nbDays} j` : ''}` : ''}</Text>
                  <Text style={s.resultFrais}>Frais estimés : {money(Math.round(frais))}{cv ? `  ·  ${trancheLabel(tranche)}` : ''}</Text>
                </View>}
          </View>
        )}
      </>
    );
  }
);
KmSection.displayName = 'KmSection';
export default KmSection;

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.soft },
  headTxt: { fontSize: 14, fontWeight: '800', color: C.petrol },
  chevron: { fontSize: 12, color: C.petrol, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: 'white' },
  row: { flexDirection: 'row', gap: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: C.line, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  boxTxt: { color: 'white', fontWeight: '900', fontSize: 13 },
  checkTxt: { fontSize: 14, fontWeight: '600', color: C.text },
  calcBtn: { backgroundColor: C.soft, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  calcTxt: { color: C.petrol, fontWeight: '800', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: 'white', borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  chipTxt: { fontSize: 12, fontWeight: '700', color: C.petrol },
  chipTxtOn: { fontSize: 12, fontWeight: '700', color: 'white' },
  hint: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 17 },
  result: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(31,78,95,0.06)' },
  resultLine: { fontSize: 13, color: C.text, fontWeight: '600' },
  resultFrais: { fontSize: 16, fontWeight: '900', color: C.petrol, marginTop: 4 },
});
