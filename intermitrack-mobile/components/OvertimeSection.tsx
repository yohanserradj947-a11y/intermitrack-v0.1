import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import NumInput from './NumInput';
import { OvertimeRule, computeOvertime, overtimeBreakdown, defaultBaseHours } from '../lib/overtime';

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const numFR = (s: string) => Number((s || '').replace(',', '.')) || 0;

// Bloc repliable de calcul des heures supplémentaires (techniciens en V1). Pré-remplit la règle
// mémorisée de la production, calcule le montant en direct, et l'ajoute au brut à la demande.
export default function OvertimeSection({ annexe, production, getRule, onAdd, onSave, variant = 'mission' }: {
  annexe?: string; production: string; getRule: (p: string) => OvertimeRule | null;
  onAdd?: (montant: number, rule: OvertimeRule) => void; onSave?: (rule: OvertimeRule) => void; variant?: 'mission' | 'config';
}) {
  const isConfig = variant === 'config';
  const C: any = useTheme();
  const s = makeS(C);
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState('');
  const [heures, setHeures] = useState(String(defaultBaseHours(annexe) || 8));
  const [paliers, setPaliers] = useState<{ h: string; pct: string }[]>([{ h: '3', pct: '25' }]);
  const [restPct, setRestPct] = useState('50');
  const [hours, setHours] = useState('');
  const [touched, setTouched] = useState(false);
  const [added, setAdded] = useState(false);

  // Pré-remplissage depuis la règle mémorisée de la prod, tant que l'utilisateur n'a rien modifié.
  useEffect(() => {
    if (touched) return;
    const r = production ? getRule(production) : null;
    if (r) {
      setBase(String(r.base));
      setHeures(String(r.heures));
      setPaliers(r.paliers.length ? r.paliers.map(p => ({ h: String(p.h), pct: String(p.pct) })) : [{ h: '3', pct: '25' }]);
      setRestPct(String(r.restPct));
    } else {
      setHeures(String(defaultBaseHours(annexe) || 8));
    }
  }, [production, getRule, touched, annexe]);

  const rule: OvertimeRule = {
    base: numFR(base), heures: numFR(heures),
    paliers: paliers.map(p => ({ h: numFR(p.h), pct: numFR(p.pct) })).filter(p => p.h > 0),
    restPct: numFR(restPct),
  };
  const nbSup = numFR(hours);
  const montant = computeOvertime(nbSup, rule);
  const lines = overtimeBreakdown(nbSup, rule);
  const taux = rule.heures > 0 ? rule.base / rule.heures : 0;
  const canAdd = nbSup > 0 && rule.base > 0 && rule.heures > 0 && montant > 0;
  const canSave = rule.base > 0 && rule.heures > 0;

  const mark = (setter: (v: string) => void) => (v: string) => { setTouched(true); setAdded(false); setter(v); };
  function setPalier(i: number, field: 'h' | 'pct', v: string) { setTouched(true); setAdded(false); setPaliers(arr => arr.map((p, j) => j === i ? { ...p, [field]: v } : p)); }
  function addPalier() { setTouched(true); setPaliers(arr => [...arr, { h: '', pct: '' }]); }
  function removePalier(i: number) { setTouched(true); setAdded(false); setPaliers(arr => arr.filter((_, j) => j !== i)); }
  function preset() { setTouched(true); setAdded(false); setPaliers([{ h: '3', pct: '25' }]); setRestPct('50'); }

  return (
    <>
      <TouchableOpacity style={s.head} onPress={() => setOpen(o => !o)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="time-outline" size={14} color={C.petrol} /><Text style={s.headTxt}>{isConfig ? 'Heures supplémentaires — barème de la prod' : 'Heures supplémentaires (optionnel)'}</Text></View>
        <Text style={s.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.body}>
          <Text style={s.hint}>Les heures sup se calculent sur la base garantie (souvent inférieure au brut affiché), avec des paliers propres à la prod.</Text>

          <View style={s.row2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Base garantie (€)</Text>
              <NumInput style={s.input} value={base} onChangeText={mark(setBase)} placeholder="Ex : 205" placeholderTextColor={C.muted} />
            </View>
            <View style={{ width: 118 }}>
              <Text style={s.label}>Heures de base</Text>
              <NumInput style={s.input} value={heures} onChangeText={mark(setHeures)} placeholder="8" placeholderTextColor={C.muted} />
            </View>
          </View>
          {taux > 0 && <Text style={s.taux}>Taux horaire de base = {money(taux)}/h</Text>}

          <View style={s.infoBox}>
            <Text style={s.infoBoxTxt}>
              <Text style={{ fontWeight: '800', color: C.petrol }}>C'est quoi la « base garantie » ? </Text>
              C'est le salaire minimum sur lequel se calculent tes heures sup — souvent le minimum de ta convention, plus bas que ta pige négociée. Tu la trouves sur ta <Text style={{ fontWeight: '800' }}>fiche de paie</Text> (ligne « salaire de base » ou le taux horaire indiqué) ou sur ton <Text style={{ fontWeight: '800' }}>contrat</Text>. Le taux horaire = cette base ÷ le nombre d'heures. Ex : 205 € pour 8 h = 25,63 €/h.
            </Text>
          </View>

          <View style={s.palHead}>
            <Text style={s.label}>Paliers de majoration</Text>
            <TouchableOpacity onPress={preset} hitSlop={6}><Text style={s.presetTxt}>Standard 25 / 50</Text></TouchableOpacity>
          </View>
          {paliers.map((p, i) => (
            <View key={i} style={s.palRow}>
              <NumInput style={s.palH} value={p.h} onChangeText={(v: string) => setPalier(i, 'h', v)} placeholder="h" placeholderTextColor={C.muted} />
              <Text style={s.palMid}>h à +</Text>
              <NumInput style={s.palPct} value={p.pct} onChangeText={(v: string) => setPalier(i, 'pct', v)} placeholder="%" placeholderTextColor={C.muted} />
              <Text style={s.palMid}>%</Text>
              <TouchableOpacity onPress={() => removePalier(i)} hitSlop={8} style={s.palDel}><Ionicons name="close" size={14} color={C.danger} /></TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={addPalier} style={s.addPal}><Text style={s.addPalTxt}>+ Ajouter un palier</Text></TouchableOpacity>
          <View style={s.palRow}>
            <Text style={[s.palMid, { flex: 1 }]}>Au-delà : +</Text>
            <NumInput style={s.palPct} value={restPct} onChangeText={mark(setRestPct)} placeholder="%" placeholderTextColor={C.muted} />
            <Text style={s.palMid}>%</Text>
          </View>

          {!isConfig && (<>
            <Text style={s.label}>Nombre d'heures supplémentaires</Text>
            <NumInput style={s.input} value={hours} onChangeText={mark(setHours)} placeholder="Ex : 5" placeholderTextColor={C.muted} />
            {canAdd && (
              <View style={s.result}>
                {lines.map((l, i) => (<Text key={i} style={s.resLine}>{l.h} h à +{l.pct} % = {money(l.montant)}</Text>))}
                <Text style={s.resTotal}>Total heures sup = {money(montant)}</Text>
              </View>
            )}
          </>)}

          {isConfig && rule.base > 0 && rule.heures > 0 && (
            <View style={s.result}>
              <Text style={s.resLine}>Aperçu : 3 h sup = {money(computeOvertime(3, rule))}</Text>
              <Text style={s.resLine}>5 h sup = {money(computeOvertime(5, rule))}</Text>
            </View>
          )}

          {isConfig ? (
            <TouchableOpacity style={[s.addBtn, (!canSave || added) && { opacity: 0.4 }]} disabled={!canSave || added} onPress={() => { onSave && onSave(rule); setAdded(true); }}>
              <Text style={s.addBtnTxt}>{added ? '✓ Barème enregistré' : 'Enregistrer le barème pour cette prod'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.addBtn, (!canAdd || added) && { opacity: 0.4 }]} disabled={!canAdd || added} onPress={() => { onAdd && onAdd(montant, rule); setAdded(true); }}>
              <Text style={s.addBtnTxt}>{added ? '✓ Ajouté au brut' : (canAdd ? `Ajouter ${money(montant)} au brut` : 'Renseigne base + heures sup')}</Text>
            </TouchableOpacity>
          )}
          <Text style={s.warn}>{isConfig ? 'Ce barème se pré-remplira sur tes prochaines missions de cette prod. Vérifie toujours avec ta fiche de paie — en test.' : "Le montant s'ajoute au brut de la mission. Vérifie toujours avec ta fiche de paie — fonctionnalité en test."}</Text>
        </View>
      )}
    </>
  );
}

const makeS = (C: any) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginTop: 4 },
  headTxt: { fontSize: 13.5, fontWeight: '800', color: C.petrol },
  chevron: { fontSize: 12, color: C.muted },
  body: { backgroundColor: C.soft, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, marginBottom: 4 },
  hint: { fontSize: 12, color: C.muted, lineHeight: 16, marginBottom: 8 },
  row2: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 13, fontSize: 15, color: C.text, backgroundColor: C.card },
  taux: { fontSize: 12, color: C.petrol, fontWeight: '700', marginTop: 8 },
  infoBox: { backgroundColor: C.card, borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.line },
  infoBoxTxt: { fontSize: 12, color: C.muted, lineHeight: 17 },
  palHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  presetTxt: { fontSize: 12, fontWeight: '800', color: C.petrol, textDecorationLine: 'underline', marginBottom: 6 },
  palRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  palH: { width: 56, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, fontSize: 14, color: C.text, backgroundColor: C.card, textAlign: 'center' },
  palPct: { width: 56, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, fontSize: 14, color: C.text, backgroundColor: C.card, textAlign: 'center' },
  palMid: { fontSize: 13, color: C.text, fontWeight: '700' },
  palDel: { marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(220,38,38,.10)' },
  addPal: { paddingVertical: 8, marginBottom: 4 },
  addPalTxt: { fontSize: 12.5, fontWeight: '800', color: C.petrol },
  result: { backgroundColor: C.card, borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: C.line },
  resLine: { fontSize: 13, color: C.muted, marginBottom: 3 },
  resTotal: { fontSize: 15, fontWeight: '900', color: C.petrol, marginTop: 4 },
  addBtn: { backgroundColor: C.petrol, borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  warn: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 8, lineHeight: 15 },
});
