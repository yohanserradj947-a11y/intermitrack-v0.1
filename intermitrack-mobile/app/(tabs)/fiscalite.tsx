import PremiumGate from "../../components/PremiumGate";
import { showAlert } from "../../lib/dialog";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../../components/GradientButton';
import NumInput from '../../components/NumInput';
import { useTrackView } from '../../lib/analytics';
import { useSession } from '../../lib/auth';
import { fiscalite, PROFILS_FISCAUX, migrerProfilFiscal, type ProfilFiscal } from '../../lib/calcul';
import { supabase } from '../../lib/supabase';
import { useTheme, useThemeControls } from '../../lib/theme';

// La palette vient maintenant du thème (lib/theme) → const C = useTheme() dans le composant.
// Le BOFiP ne range pas les artistes par annexe mais par déduction : le 14 % est ouvert aux
// musiciens, choristes, lyriques et danseurs (§ 440/460), pas aux comédiens (§ 480). D'où 5 cas
// et non 3. « Artiste dramatique / lyrique » mélangeait deux métiers aux droits différents.
const PROFILS: { key: ProfilFiscal; label: string }[] = [
  { key: 'technicien', label: 'Technicien' },
  { key: 'musicien', label: 'Musicien / choriste' },
  { key: 'lyrique', label: 'Artiste lyrique' },
  { key: 'danseur', label: 'Danseur' },
  { key: 'comedien', label: 'Comédien' },
];
const CATS = ['Matériel / Achat', 'Repas', 'Transport', 'Hébergement', 'Formation', 'Vêtements pro', 'Téléphone / Internet', 'Cotisations pro', 'Documentation', 'Autres'];
const num = (v: string) => { const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const money2 = (n: number) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function FiscaliteInner() {
  useTrackView('fiscalite');
  const C = useTheme();
  const { scheme } = useThemeControls();
  const s = useMemo(() => makeS(C), [C]);
  const Row = ({ label, value, hl }: { label: string; value: string; hl?: boolean }) => (
    <View style={[s.resultRow, hl && s.resultHL]}>
      <Text style={s.resultLbl}>{label}</Text>
      <Text style={s.resultVal}>{value}</Text>
    </View>
  );
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const uid = session?.user?.id;
  // Année FISCALE navigable (impôts = année civile). On déclare souvent l'année précédente.
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);

  const [missions, setMissions] = useState<any[]>([]);
  const [frais, setFrais] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // "Mes infos" (persistés)
  const [profil, setProfil] = useState<ProfilFiscal>('technicien');
  const [are, setAre] = useState('');
  const [conges, setConges] = useState('');
  const [other, setOther] = useState('');
  const [parts, setParts] = useState('1');
  const [autresFrais, setAutresFrais] = useState('');

  // Modale frais
  const [showFrais, setShowFrais] = useState(false);
  const [fDate, setFDate] = useState(new Date());
  const [fCat, setFCat] = useState(CATS[0]);
  const [fDesc, setFDesc] = useState('');
  const [fMontant, setFMontant] = useState('');
  const [showDate, setShowDate] = useState(false);

  useEffect(() => { loadLocal(); load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [m, f] = await Promise.all([
      supabase.from('missions').select('*'),
      supabase.from('frais').select('*').order('frais_date', { ascending: false }),
    ]);
    if (m.data) setMissions(m.data);
    if (f.data) setFrais(f.data);
    setLoading(false);
  }
  async function loadLocal() {
    const keys = ['fisc_profil', 'fisc_are', 'fisc_conges', 'fisc_other', 'fisc_parts', 'fisc_autresfrais'];
    const v = await AsyncStorage.multiGet(keys);
    const map = Object.fromEntries(v);
    // migrerProfilFiscal : l'ancienne clé 'artiste' devient 'comedien' (même résultat qu'avant,
    // donc aucun chiffre ne bouge sous les pieds de l'utilisateur). Un lyrique ou un danseur
    // devra se re-sélectionner — et y gagnera.
    if (map.fisc_profil) setProfil(migrerProfilFiscal(map.fisc_profil));
    if (map.fisc_are) setAre(map.fisc_are);
    if (map.fisc_conges) setConges(map.fisc_conges);
    if (map.fisc_other) setOther(map.fisc_other);
    if (map.fisc_parts) setParts(map.fisc_parts);
    if (map.fisc_autresfrais) setAutresFrais(map.fisc_autresfrais);
  }
  const save = (k: string, setter: (v: any) => void) => (v: any) => { setter(v); AsyncStorage.setItem(k, String(v)); };

  // ---- Données auto depuis les missions ----
  const yMissions = missions.filter((m: any) => new Date((m.mission_date || '') + 'T00:00:00').getFullYear() === year);
  const yearGross = yMissions.reduce((a: number, m: any) => a + Number(m.gross_amount || 0), 0);
  const totalKmAmount = yMissions.reduce((a: number, m: any) => a + Number(m.km_amount || 0), 0);
  // Total de kilomètres de l'année (distance, pas le montant) — pratique au moment de déclarer (retour JB).
  const totalKmDistance = Math.round(yMissions.reduce((a: number, m: any) => a + Number(m.km_distance || 0), 0));
  const fraisSaisis = frais.filter((x: any) => (x.frais_date || '').slice(0, 4) === String(year)).reduce((a: number, x: any) => a + Number(x.montant || 0), 0);

  const congesSpec = conges !== '' ? num(conges) : Math.round(yearGross * 0.10);
  const r = fiscalite({ profil, yearGross, arePercue: num(are), congesSpec, otherIncome: num(other), taxParts: num(parts) || 1, totalKmAmount, autresFrais: num(autresFrais), fraisSaisis });

  async function saveFrais() {
    if (!uid) return;
    if (!(num(fMontant) > 0)) { showAlert('Montant manquant', 'Indique un montant.'); return; }
    const { error } = await supabase.from('frais').insert({ user_id: uid, frais_date: iso(fDate), categorie: fCat, description: fDesc.trim() || null, montant: num(fMontant) });
    if (error) { showAlert('Erreur', error.message); return; }
    setShowFrais(false); setFDesc(''); setFMontant(''); load();
  }
  function deleteFrais(id: string) {
    showAlert('Supprimer ?', 'Cette dépense sera supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { const { error } = await supabase.from('frais').delete().eq('id', id); if (error) { showAlert('Erreur', error.message); return; } load(); } },
    ]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={C.petrol} /></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={s.title}>Fiscalité</Text>
        <Text style={s.sub}>Estimations indicatives pour intermittents du spectacle.</Text>
        {/* Année fiscale (impôts = année civile) : navigable pour déclarer l'année précédente. */}
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:18,marginTop:12}}>
          <TouchableOpacity onPress={()=>setYear(y=>y-1)} hitSlop={10} style={s.yrArrow}><Text style={s.yrArrowTxt}>‹</Text></TouchableOpacity>
          <View style={{alignItems:'center',minWidth:110}}>
            <Text style={s.yrVal}>{year}</Text>
            <Text style={s.yrCap}>{year===nowYear?'Année en cours':`Revenus ${year}`}</Text>
          </View>
          <TouchableOpacity onPress={()=>setYear(y=>Math.min(nowYear,y+1))} disabled={year>=nowYear} hitSlop={10} style={[s.yrArrow,year>=nowYear&&{opacity:0.3}]}><Text style={s.yrArrowTxt}>›</Text></TouchableOpacity>
        </View>
        {!yMissions.length && <Text style={[s.sub,{textAlign:'center',marginTop:6}]}>Aucune mission saisie en {year}.</Text>}
      </View>

      <View style={s.warn}>
        <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="warning-outline" size={13} color={C.warnTx} /><Text style={s.warnTitle}>Version bêta — estimations</Text></View>
        <Text style={s.warnTxt}>Tous les montants sont des estimations pouvant être faussées selon ta situation. Vérifie sur impots.gouv.fr avant toute déclaration.</Text>
      </View>

      {/* ===== Mes infos ===== */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Mes infos</Text>
        <Text style={s.cardSub}>Renseigne-les une fois, les résultats s&apos;actualisent en dessous.</Text>

        <Text style={s.label}>Statut</Text>
        <View style={s.chips}>
          {PROFILS.map((p) => (
            <TouchableOpacity key={p.key} style={[s.chip, profil === p.key && s.chipOn]} onPress={() => save('fisc_profil', setProfil)(p.key)}>
              <Text style={profil === p.key ? s.chipTxtOn : s.chipTxt}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.autoRow}>
          <Text style={s.autoLbl}>Brut annuel (missions) <Text style={s.autoTag}>✓ auto</Text></Text>
          <Text style={s.autoVal}>{money0(yearGross)}</Text>
        </View>

        {/* Pas d'estimation auto ici, contrairement aux Congés Spectacles : l'ARE annuelle ne pourrait
            venir que de la somme de 12 estimations mensuelles, qui sont des fourchettes. Ce champ part
            dans une déclaration d'impôts — on renvoie donc au seul chiffre qui fasse foi. */}
        <Text style={s.label}>ARE perçue sur l&apos;année (€)</Text>
        <NumInput style={s.input} value={are} onChangeText={save('fisc_are', setAre)} placeholder="Ex : 4200" placeholderTextColor={C.muted} />
        <Text style={s.hint}>Le montant exact figure sur ton attestation fiscale France Travail (espace personnel → Mes allocations → Attestation fiscale).</Text>

        <Text style={s.label}>Congés Spectacles reçus (€)</Text>
        <NumInput style={s.input} value={conges} onChangeText={save('fisc_conges', setConges)} placeholder={`Estimé auto ~${money0(Math.round(yearGross * 0.10))}`} placeholderTextColor={C.muted} />

        <Text style={s.label}>Autres revenus imposables (€)</Text>
        <NumInput style={s.input} value={other} onChangeText={save('fisc_other', setOther)} placeholder="0" placeholderTextColor={C.muted} />

        <Text style={s.label}>Nombre de parts fiscales</Text>
        <NumInput style={s.input} value={parts} onChangeText={save('fisc_parts', setParts)} placeholder="1" placeholderTextColor={C.muted} />
        <Text style={s.hint}>1 = célibataire · 2 = couple · +0,5 par enfant</Text>
      </View>

      {/* ===== Frais réels ===== */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Mes frais réels</Text>
        <GradientButton label="+ Dépense" onPress={() => { setShowFrais(true); setFDate(new Date()); }} style={s.addBtn} textStyle={s.addBtnTxt} />
      </View>
      <View style={s.card}>
        <View style={s.autoRow}><Text style={s.autoLbl}>Frais km (missions) <Text style={s.autoTag}>✓ auto</Text></Text><Text style={s.autoVal}>{money2(totalKmAmount)}</Text></View>
        <View style={s.autoRow}><Text style={s.autoLbl}>Total kilomètres ({year})</Text><Text style={s.autoVal}>{totalKmDistance} km</Text></View>
        <View style={s.autoRow}><Text style={s.autoLbl}>Dépenses saisies ({year})</Text><Text style={s.autoVal}>{money2(fraisSaisis)}</Text></View>
        <Text style={s.label}>Autres frais réels non listés (€)</Text>
        <NumInput style={s.input} value={autresFrais} onChangeText={save('fisc_autresfrais', setAutresFrais)} placeholder="0" placeholderTextColor={C.muted} />
        {frais.filter((x: any) => (x.frais_date || '').slice(0, 4) === String(year)).map((x: any) => (
          <View key={x.id} style={s.fraisRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.fraisCat}>{x.categorie}{x.description ? ' · ' + x.description : ''}</Text>
              <Text style={s.fraisDate}>{fmtDate(x.frais_date)}</Text>
            </View>
            <Text style={s.fraisAmount}>{money2(Number(x.montant))}</Text>
            <TouchableOpacity onPress={() => deleteFrais(x.id)} style={s.fraisDel}><Text style={s.fraisDelTxt}>✕</Text></TouchableOpacity>
          </View>
        ))}
      </View>

      {/* ===== Résultats ===== */}
      <View style={s.sectionHead}><Text style={s.sectionTitle}>Résultats estimés</Text></View>
      <View style={s.card}>
        <Row label="Net imposable estimé" value={money0(r.netTotal)} hl />
        <Row label="Forfait (abattement)" value={money0(r.forfait)} />
        <Row label="Frais réels (km + dépenses + autres)" value={money0(r.totalFraisReels)} />
        <View style={s.compareRow}>
          <View style={[s.compareCard, r.useForfait && s.compareWin]}>
            <Text style={s.compareTitle}>Forfait</Text>
            <Text style={s.compareAmount}>{money0(r.forfait)}</Text>
            <Text style={s.compareTag}>{r.useForfait ? '✓ Recommandé' : 'Alternative'}</Text>
          </View>
          <View style={[s.compareCard, !r.useForfait && r.totalFraisReels > 0 && s.compareWin]}>
            <Text style={s.compareTitle}>Frais réels</Text>
            <Text style={s.compareAmount}>{money0(r.totalFraisReels)}</Text>
            <Text style={s.compareTag}>{!r.useForfait && r.totalFraisReels > 0 ? '✓ Recommandé' : 'Alternative'}</Text>
          </View>
        </View>
        <Row label="Base imposable estimée" value={money0(r.bestBase)} hl />
        <View style={s.sep} />
        <View style={[s.resultRow, s.bigRow]}>
          <Text style={s.bigLbl}>Impôt estimé</Text>
          <Text style={s.bigVal}>{r.tax ? money0(r.tax.estimatedTax) : 'Renseigne tes parts'}</Text>
        </View>
        <Row label="Taux moyen estimé" value={r.tax ? r.tax.averageRate.toFixed(1).replace('.', ',') + ' %' : '—'} />
        <Row label="Tranche marginale" value={r.tax ? Math.round(r.tax.marginalRate) + ' %' : '—'} />
        <Row label="CSG/CRDS non déductible (2,4%)" value={money0(r.csgNonDed)} />
        <Text style={s.hint}>À déclarer en traitements & salaires : brut intermittent + ARE + Congés Spectacles + autres revenus.</Text>
      </View>

      {/* ===== Modale frais ===== */}
      <Modal visible={showFrais} animationType="slide" transparent onRequestClose={() => setShowFrais(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.overlay}>
            <View style={[s.modalCard, { paddingBottom: 22 + insets.bottom }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.modalTitle}>Ajouter une dépense</Text>
                <Text style={s.label}>Date</Text>
                <TouchableOpacity style={s.input} onPress={() => setShowDate(true)}><Text style={s.inputTxt}>{fDate.toLocaleDateString('fr-FR')}</Text></TouchableOpacity>
                {showDate && <DateTimePicker value={fDate} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setShowDate(false); if (d) setFDate(d); }} />}
                <Text style={s.label}>Catégorie</Text>
                <View style={s.chips}>
                  {CATS.map((c) => (
                    <TouchableOpacity key={c} style={[s.chip, fCat === c && s.chipOn]} onPress={() => setFCat(c)}><Text style={fCat === c ? s.chipTxtOn : s.chipTxt}>{c}</Text></TouchableOpacity>
                  ))}
                </View>
                <Text style={s.label}>Description</Text>
                <TextInput style={s.input} value={fDesc} onChangeText={setFDesc} placeholder="Ex : Micro-cravate" placeholderTextColor={C.muted} />
                <Text style={s.label}>Montant (€)</Text>
                <NumInput style={s.input} value={fMontant} onChangeText={setFMontant} placeholder="Ex : 120" placeholderTextColor={C.muted} />
                <GradientButton label="Ajouter la dépense" onPress={saveFrais} style={s.saveBtn} textStyle={s.saveBtnTxt} />
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowFrais(false)}><Text style={s.cancelBtnTxt}>Annuler</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const makeS = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.card, padding: 18, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { fontSize: 22, fontWeight: '900', color: C.petrol, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: C.muted, marginTop: 4 },
  yrArrow: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: C.petrol, alignItems: 'center', justifyContent: 'center' },
  yrArrowTxt: { fontSize: 22, fontWeight: '900', color: C.petrol, lineHeight: 24 },
  yrVal: { fontSize: 24, fontWeight: '900', color: C.text },
  yrCap: { fontSize: 11.5, color: C.muted, marginTop: 1 },
  warn: { backgroundColor: C.warnBg, borderWidth: 1, borderColor: C.warnBd, borderRadius: 12, margin: 16, marginBottom: 0, padding: 12 },
  warnTitle: { fontSize: 13, fontWeight: '800', color: C.warnTx },
  warnTxt: { fontSize: 12, color: C.warnTx, marginTop: 4, lineHeight: 17 },
  card: { backgroundColor: C.card, margin: 16, marginTop: 12, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line },
  cardTitle: { fontSize: 17, fontWeight: '900', color: C.petrol },
  cardSub: { fontSize: 12, color: C.muted, marginTop: 2, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 16 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.card },
  inputTxt: { fontSize: 15, color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 99, backgroundColor: C.soft },
  chipOn: { backgroundColor: C.petrol },
  chipTxt: { fontSize: 13, fontWeight: '700', color: C.petrol },
  chipTxtOn: { fontSize: 13, fontWeight: '700', color: 'white' },
  autoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.soft },
  autoLbl: { fontSize: 13, fontWeight: '700', color: C.petrol, flex: 1 },
  autoTag: { fontSize: 10, fontWeight: '800', color: C.green },
  autoVal: { fontSize: 15, fontWeight: '900', color: C.petrol },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.petrol },
  addBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  addBtnTxt: { color: 'white', fontWeight: '800', fontSize: 13 },
  fraisRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.soft },
  fraisCat: { fontSize: 13, fontWeight: '700', color: C.text },
  fraisDate: { fontSize: 11, color: C.muted, marginTop: 1 },
  fraisAmount: { fontSize: 14, fontWeight: '800', color: C.petrol },
  fraisDel: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.warnBg, alignItems: 'center', justifyContent: 'center' },
  fraisDelTxt: { color: C.danger, fontWeight: '800' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 11, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, marginBottom: 6, gap: 10 },
  resultHL: { backgroundColor: 'rgba(31,78,95,0.06)', borderColor: 'rgba(31,78,95,0.14)' },
  resultLbl: { fontSize: 13, fontWeight: '700', color: C.petrol, flex: 1 },
  resultVal: { fontSize: 14, fontWeight: '800', color: C.petrol },
  sep: { height: 1, backgroundColor: C.line, marginVertical: 8 },
  bigRow: { backgroundColor: C.petrol, borderColor: C.petrol },
  bigLbl: { fontSize: 14, fontWeight: '800', color: 'white', flex: 1 },
  bigVal: { fontSize: 18, fontWeight: '900', color: 'white' },
  compareRow: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  compareCard: { flex: 1, borderRadius: 13, padding: 12, borderWidth: 2, borderColor: C.line, alignItems: 'center' },
  compareWin: { borderColor: C.green, backgroundColor: C.greenBg },
  compareTitle: { fontSize: 12, fontWeight: '700', color: C.petrol },
  compareAmount: { fontSize: 18, fontWeight: '900', color: C.petrol, marginVertical: 4 },
  compareTag: { fontSize: 10, fontWeight: '700', color: C.muted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.petrol, marginBottom: 8, textAlign: 'center' },
  saveBtn: { borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveBtnTxt: { color: 'white', fontWeight: '800', fontSize: 15 },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelBtnTxt: { color: C.muted, fontWeight: '700', fontSize: 14 },
});

export default function Fiscalite(){ return (<PremiumGate title="Fiscalité"><FiscaliteInner/></PremiumGate>); }
