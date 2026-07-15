import { showAlert } from "../lib/dialog";
import { forwardRef, useImperativeHandle, useState, useMemo, useEffect } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NumInput from './NumInput';
import AddressPickerModal from './AddressPickerModal';
import { useTheme } from '../lib/theme';
import { useKmDefaults } from '../lib/kmAddresses';
import type { Addr, KmDefaults } from '../lib/kmAddresses';
import { VEHICLES, CAR_CV, MOTO_CV } from '../lib/kmBareme';

// La palette vient du thème (lib/theme) → const C = useTheme() dans le composant.

// Le barème vit désormais dans lib/kmBareme (vérifié sur sources officielles). Celui qui était ici
// était faux : une seule catégorie « Moto » traitée comme une 1-2 CV, les tranches voiture appliquées
// aux motos, et le montant fixe de la tranche intermédiaire purement ignoré.
export function pf(v: string) { const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : 0; }

// Rappel court du véhicule retenu, pour qu'on comprenne d'où sort le taux affiché.
function vehiculeLabel(d: KmDefaults) {
  const v = VEHICLES.find((x) => x.key === d.kind)?.label ?? '';
  const cv = d.kind === 'cyclo' ? '' : ((d.kind === 'moto' ? MOTO_CV : CAR_CV).find((x) => x.key === d.cv)?.label ?? '');
  return [v, cv, d.kmAnnuel ? `${d.kmAnnuel.toLocaleString('fr-FR')} km/an` : '', d.electrique ? 'électrique' : ''].filter(Boolean).join(' · ');
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) { const R = 6371, tr = (d: number) => d * Math.PI / 180; const dLat = tr(lat2 - lat1), dLon = tr(lon2 - lon1); const x = Math.sin(dLat / 2) ** 2 + Math.cos(tr(lat1)) * Math.cos(tr(lat2)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
const money = (n: number) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Les adresses font partie des valeurs enregistrées depuis le 15/07/2026 : avant, seuls
// distance/taux/montant l'étaient, d'où « les adresses n'apparaissent pas quand je modifie
// une mission » — elles n'existaient tout simplement pas en base.
export type KmValues = {
  km_distance: number; km_rate: number; km_amount: number;
  km_from: string | null; km_to: string | null;
  km_from_lat: number | null; km_from_lng: number | null;
  km_to_lat: number | null; km_to_lng: number | null;
};
export type KmHandle = { values: (nbDays: number) => KmValues };

// Section "Frais kilométriques" réutilisable. nbDays = jours travaillés (pour ×jours).
// Le parent récupère les valeurs via ref.current.values(nbDays) et fournit les adresses connues.
const KmSection = forwardRef<KmHandle, {
  nbDays: number; initialDistance?: number; initialRate?: number;
  initialFrom?: string; initialTo?: string;
  initialFromCoords?: number[] | null; initialToCoords?: number[] | null;
  // Une seule réserve d'adresses pour le départ ET l'arrivée (retour Yohan).
  addresses?: Addr[];
}>(
  ({ nbDays, initialDistance, initialRate, initialFrom, initialTo, initialFromCoords, initialToCoords, addresses = [] }, ref) => {
    const C = useTheme();
    const s = useMemo(() => makeS(C), [C]);
    const [open, setOpen] = useState(!!(initialDistance));
    const [from, setFrom] = useState(initialFrom || '');
    const [to, setTo] = useState(initialTo || '');
    const [fromC, setFromC] = useState<number[] | null>(initialFromCoords || null);
    const [toC, setToC] = useState<number[] | null>(initialToCoords || null);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);
    const [rt, setRt] = useState(false);
    const [everyDay, setEveryDay] = useState(false);
    const [justify, setJustify] = useState(false);
    // Véhicule mémorisé dans « Mes informations » (retour JB) : il fournit directement le taux réel
    // en €/km, calculé par le barème officiel. Le champ « Taux €/km » ci-dessous reste prioritaire
    // pour qui veut forcer une valeur sur une mission précise.
    const kmDefaults = useKmDefaults();
    const [distance, setDistance] = useState(initialDistance ? String(initialDistance) : '');
    const [rate, setRate] = useState(initialRate ? String(initialRate) : '');
    const [calc, setCalc] = useState(false);

    // Plafond domicile-travail : 40 km par trajet, sauf justification.
    const kmBase = () => justify ? pf(distance) : Math.min(pf(distance), 40);
    function valuesFor(nb: number): KmValues {
      const eff = kmBase() * (rt ? 2 : 1) * (everyDay ? Math.max(1, nb) : 1);
      // Le taux saisi à la main l'emporte ; sinon, le taux réel issu du barème et du profil.
      const frais = eff * (pf(rate) > 0 ? pf(rate) : kmDefaults.taux);
      return {
        km_distance: Math.round(eff), km_rate: pf(rate), km_amount: Math.round(frais * 100) / 100,
        km_from: from.trim() || null, km_to: to.trim() || null,
        km_from_lat: fromC ? fromC[1] : null, km_from_lng: fromC ? fromC[0] : null,
        km_to_lat: toC ? toC[1] : null, km_to_lng: toC ? toC[0] : null,
      };
    }
    useImperativeHandle(ref, () => ({ values: valuesFor }));

    const eff = kmBase() * (rt ? 2 : 1) * (everyDay ? Math.max(1, nbDays) : 1);
    const frais = eff * (pf(rate) > 0 ? pf(rate) : kmDefaults.taux);

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
            {/* Pop-up des adresses déjà saisies, de la plus utilisée à la moins utilisée : le domicile
                remonte tout seul en tête pour le départ. Retours JB et second utilisateur. */}
            <Text style={s.label}>Lieu de départ</Text>
            <TouchableOpacity style={s.pickBtn} onPress={() => setShowFromPicker(true)}>
              <Text style={[s.pickTxt, !from && { color: C.muted, fontWeight: '400' }]} numberOfLines={1}>{from || 'Choisir ou saisir…'}</Text>
              <Text style={s.pickChevron}>▾</Text>
            </TouchableOpacity>
            <AddressPickerModal visible={showFromPicker} addresses={addresses} current={from} title="Lieu de départ"
              onPick={(l, c) => { setFrom(l); setFromC(c); setShowFromPicker(false); }} onClose={() => setShowFromPicker(false)} />

            <Text style={s.label}>Lieu d'arrivée</Text>
            <TouchableOpacity style={s.pickBtn} onPress={() => setShowToPicker(true)}>
              <Text style={[s.pickTxt, !to && { color: C.muted, fontWeight: '400' }]} numberOfLines={1}>{to || 'Choisir ou saisir…'}</Text>
              <Text style={s.pickChevron}>▾</Text>
            </TouchableOpacity>
            <AddressPickerModal visible={showToPicker} addresses={addresses} current={to} title="Lieu d'arrivée"
              onPick={(l, c) => { setTo(l); setToC(c); setShowToPicker(false); }} onClose={() => setShowToPicker(false)} />
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
                <NumInput style={s.input} value={rate} onChangeText={setRate} placeholder="sinon barème" placeholderTextColor={C.muted} />
              </View>
            </View>
            {/* Plus de pastilles « puissance fiscale » ni de tranche ici : le barème dépend du type de
                véhicule ET du kilométrage annuel réel, qui vivent dans « Mes informations ». Les
                redemander à chaque mission serait redondant (retour JB) et surtout on ne peut pas
                calculer le montant fixe du barème sans le kilométrage annuel. */}
            {kmDefaults.pret && kmDefaults.taux > 0 && pf(rate) <= 0 ? (
              <Text style={s.hint}>
                Barème appliqué : <Text style={{ fontWeight: '900', color: C.petrol }}>{kmDefaults.taux.toFixed(3).replace('.', ',')} €/km</Text>
                {'  ·  '}{vehiculeLabel(kmDefaults)} — modifiable dans « Mes informations ».
              </Text>
            ) : null}
            {(eff > 0 && kmDefaults.pret && kmDefaults.taux <= 0 && pf(rate) <= 0)
              ? <Text style={[s.hint, { color: C.orange, fontWeight: '700' }]}>Renseigne ton véhicule et tes kilomètres annuels dans « Mes informations » (ou saisis un taux €/km ci-dessus) pour estimer les frais.</Text>
              : <View style={s.result}>
                  <Text style={s.resultLine}>Distance comptée : <Text style={{ fontWeight: '900' }}>{Math.round(eff)} km</Text>{(rt || everyDay || (!justify && pf(distance) > 40)) ? `  =  ${Math.round(kmBase())} km${(!justify && pf(distance) > 40) ? ' (plafond 40)' : ''}${rt ? ' × 2 (A/R)' : ''}${everyDay ? ` × ${nbDays} j` : ''}` : ''}</Text>
                  <Text style={s.resultFrais}>Frais estimés : {money(Math.round(frais))}</Text>
                </View>}
          </View>
        )}
      </>
    );
  }
);
KmSection.displayName = 'KmSection';
export default KmSection;

const makeS = (C:any) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.soft },
  headTxt: { fontSize: 14, fontWeight: '800', color: C.petrol },
  chevron: { fontSize: 12, color: C.petrol, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.card },
  // Bouton qui ouvre le pop-up d'adresses (même allure que les autres sélecteurs de l'appli).
  pickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: C.card },
  pickTxt: { fontSize: 15, fontWeight: '700', color: C.text, flexShrink: 1 },
  pickChevron: { fontSize: 12, color: C.muted },
  row: { flexDirection: 'row', gap: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  boxTxt: { color: 'white', fontWeight: '900', fontSize: 13 },
  checkTxt: { fontSize: 14, fontWeight: '600', color: C.text },
  calcBtn: { backgroundColor: C.soft, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  calcTxt: { color: C.petrol, fontWeight: '800', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  chipTxt: { fontSize: 12, fontWeight: '700', color: C.petrol },
  chipTxtOn: { fontSize: 12, fontWeight: '700', color: 'white' },
  hint: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 17 },
  result: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.soft },
  resultLine: { fontSize: 13, color: C.text, fontWeight: '600' },
  resultFrais: { fontSize: 16, fontWeight: '900', color: C.petrol, marginTop: 4 },
});
