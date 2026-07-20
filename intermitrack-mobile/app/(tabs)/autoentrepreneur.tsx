import PremiumGate from "../../components/PremiumGate";
import { showAlert } from "../../lib/dialog";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AddressInput from '../../components/AddressInput';
import { GradientButton } from '../../components/GradientButton';
import NumInput from '../../components/NumInput';
import TxtInput from '../../components/TxtInput';
import { useTrackView } from '../../lib/analytics';
import { useSession } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useTheme, useThemeControls } from '../../lib/theme';

// const C = palette du thème (voir lib/theme.tsx). sage → C.green, orange → C.orange.
const AE_PLAFOND = 77700;
const AE_TVA_SEUIL = 39100; // seuil de franchise en base majoré (prestations de services) — paramétrable/à fiabiliser
const AE_TAUX_DEFAUT = 24.6;
const PRESTA_OPTIONS = ['Régie générale', 'Son / mix', 'Lumière', 'Vidéo / captation', 'Montage / post-prod', 'Montage-démontage', 'Création / conception', 'Photographie', 'Formation', 'Communication', 'Location de matériel', 'Frais de déplacement'];
const UNITES = ['jour', 'heure', 'forfait', 'unité'];
const TYPES_SOC = ['Client', 'Production', 'Employeur', 'Prestataire'];

function money2(n: number) { return (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function money0(n: number) { return (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }
function fmtDate(d: string) { if (!d) return ''; return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtPeriod(s: string, e: string) { if (!e || e === s) return fmtDate(s); return fmtDate(s) + ' → ' + fmtDate(e); }
function iso(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

type Ligne = { designation: string; quantite: number; unite: string; prixUnitaire: number };

function AutoEntrepreneurInner() {
  const C = useTheme();
  const { scheme } = useThemeControls();
  const s = useMemo(() => makeS(C), [C]);
  useTrackView('autoentrepreneur');
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const uid = session?.user?.id;

  const [factures, setFactures] = useState<any[]>([]);
  const [societes, setSocietes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [taux, setTaux] = useState(String(AE_TAUX_DEFAUT));
  const [profile, setProfile] = useState<any>({ nom: '', siret: '', adresse: '', contact: '', tva: 'TVA non applicable, art. 293 B du CGI' });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState<'all' | 'payee' | 'impayee'>('all');
  const [socPage, setSocPage] = useState(1);

  // Modale facture
  const [showFac, setShowFac] = useState(false);
  const [docType, setDocType] = useState<'facture' | 'devis'>('facture');
  const [facBonCmd, setFacBonCmd] = useState('');
  const [facEditId, setFacEditId] = useState<string | null>(null);
  const [facClient, setFacClient] = useState('');
  const [facAddr, setFacAddr] = useState('');
  const [facStart, setFacStart] = useState(new Date());
  const [facEnd, setFacEnd] = useState<Date | null>(null);
  const [facStatus, setFacStatus] = useState<'impayee' | 'payee'>('impayee');
  const [customPresta, setCustomPresta] = useState<string[]>([]);
  const [showPresta, setShowPresta] = useState(false);
  const [prestaSel, setPrestaSel] = useState<string[]>([]);
  const [prestaCustom, setPrestaCustom] = useState('');
  useEffect(() => { (async () => {
    if (!uid) { setCustomPresta([]); return; }
    const k = `intermitrack_ae_custom_presta_${uid}`;
    const fk = `intermitrack_ae_presta_synced_${uid}`;
    try {
      const { data } = await supabase.from('profiles').select('ae_custom_presta').eq('id', uid).maybeSingle();
      const db = (data && Array.isArray(data.ae_custom_presta)) ? data.ae_custom_presta : [];
      const flag = await AsyncStorage.getItem(fk);
      let arr: string[] = [];
      if (db.length) { arr = db; }
      else if (!flag) { const l = await AsyncStorage.getItem(k); const local = l ? JSON.parse(l) : []; if (local.length) { arr = local; try { await supabase.from('profiles').upsert({ id: uid, ae_custom_presta: local }, { onConflict: 'id' }); } catch (e) {} } }
      setCustomPresta(arr);
      AsyncStorage.setItem(k, JSON.stringify(arr));
      AsyncStorage.setItem(fk, '1');
    } catch (e) { try { const l = await AsyncStorage.getItem(k); setCustomPresta(l ? JSON.parse(l) : []); } catch (_) {} }
  })(); }, [uid]);
  function persistPresta(next: string[]) { if (uid) { AsyncStorage.setItem(`intermitrack_ae_custom_presta_${uid}`, JSON.stringify(next)); supabase.from('profiles').upsert({ id: uid, ae_custom_presta: next }, { onConflict: 'id' }).then(() => {}, () => {}); } }
  function addCustomPresta(name: string) { const v = (name || '').trim(); if (!v) return; setCustomPresta(prev => { if (prev.map(x => x.toLowerCase()).includes(v.toLowerCase()) || PRESTA_OPTIONS.map(x => x.toLowerCase()).includes(v.toLowerCase())) return prev; const next = [...prev, v]; persistPresta(next); return next; }); }
  function removeCustomPresta(name: string) { setCustomPresta(prev => { const next = prev.filter(x => x.toLowerCase() !== name.toLowerCase()); persistPresta(next); return next; }); }
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modale profil (infos sur les factures)
  const [showProfile, setShowProfile] = useState(false);
  const [carnetOpen, setCarnetOpen] = useState(false);
  const [showClients, setShowClients] = useState(false);

  // Modale société
  const [showSoc, setShowSoc] = useState(false);
  const [socEditId, setSocEditId] = useState<string | null>(null);
  const [socNom, setSocNom] = useState('');
  const [socType, setSocType] = useState('Client');
  const [socAddr, setSocAddr] = useState('');
  const [socTel, setSocTel] = useState('');
  const [socEmail, setSocEmail] = useState('');
  const [socSiret, setSocSiret] = useState('');

  useEffect(() => { load(); loadLocal(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [f, s] = await Promise.all([
      supabase.from('factures').select('*').order('facture_date', { ascending: false }),
      supabase.from('societes').select('*').order('nom', { ascending: true }),
    ]);
    if (f.data) setFactures(f.data);
    if (s.data) setSocietes(s.data);
    setLoading(false);
  }
  async function loadLocal() {
    const t = await AsyncStorage.getItem('ae_taux'); if (t) setTaux(t);
    const p = await AsyncStorage.getItem('ae_profile'); if (p) setProfile(JSON.parse(p));
  }
  async function saveTaux(v: string) { setTaux(v); await AsyncStorage.setItem('ae_taux', v); }
  async function saveProfile() { await AsyncStorage.setItem('ae_profile', JSON.stringify(profile)); setShowProfile(false); }

  // ---- Calculs (identiques au site) ----
  const tauxNum = (Number(taux) || 0) / 100;
  const sum = (list: any[]) => {
    const paid = list.filter((f) => f.status === 'payee').reduce((a, f) => a + Number(f.amount || 0), 0);
    const pending = list.filter((f) => f.status !== 'payee').reduce((a, f) => a + Number(f.amount || 0), 0);
    return { paid, pending, total: paid + pending };
  };
  const year = month.slice(0, 4);
  const ms = sum(factures.filter((f) => (f.facture_date || '').slice(0, 7) === month));
  const ys = sum(factures.filter((f) => (f.facture_date || '').slice(0, 4) === year));
  const pct = Math.min(100, Math.round((ys.total / AE_PLAFOND) * 100));

  const filtered = factures.filter((f) => filter === 'all' ? true : (filter === 'payee' ? f.status === 'payee' : f.status !== 'payee'));

  const SOC_PER_PAGE = 8;
  const socPages = Math.max(1, Math.ceil(societes.length / SOC_PER_PAGE));
  const sp = Math.min(Math.max(1, socPage), socPages);
  const socPageItems = societes.slice((sp - 1) * SOC_PER_PAGE, sp * SOC_PER_PAGE);

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }

  // ---- Lignes de facture ----
  const lignesTotal = lignes.reduce((a, l) => a + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0), 0);
  function addLigne(designation: string) { setLignes((p) => [...p, { designation, quantite: 1, unite: 'jour', prixUnitaire: 0 }]); }
  function updLigne(i: number, patch: Partial<Ligne>) { setLignes((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l)); }
  function delLigne(i: number) { setLignes((p) => p.filter((_, idx) => idx !== i)); }

  function openNewFacture(type: 'facture' | 'devis' = 'facture') {
    setDocType(type); setFacEditId(null); setFacClient(''); setFacAddr(''); setFacStart(new Date()); setFacEnd(null); setFacStatus('impayee'); setFacBonCmd(''); setLignes([]); setShowFac(true);
  }
  function openEditFacture(f: any) {
    setFacEditId(f.id); setFacClient(f.client || ''); setFacAddr(f.client_address || '');
    setFacStart(new Date((f.facture_date) + 'T00:00:00')); setFacEnd(f.facture_end_date ? new Date(f.facture_end_date + 'T00:00:00') : null);
    setFacStatus(f.status === 'payee' ? 'payee' : 'impayee'); setDocType(f.type === 'devis' ? 'devis' : 'facture'); setFacBonCmd(f.bon_commande || '');
    setLignes(Array.isArray(f.lignes) && f.lignes.length ? f.lignes.map((l: any) => ({ designation: l.designation || '', quantite: Number(l.quantite) || 1, unite: l.unite || 'forfait', prixUnitaire: Number(l.prixUnitaire) || 0 })) : [{ designation: f.prestation || '', quantite: 1, unite: 'forfait', prixUnitaire: Number(f.amount) || 0 }]);
    setShowFac(true);
  }
  // Transforme un devis en NOUVELLE facture (le devis est conservé). Le n° de bon de commande peut être ajouté dans le formulaire.
  function convertToFacture(f: any) {
    setDocType('facture'); setFacEditId(null);
    setFacClient(f.client || ''); setFacAddr(f.client_address || '');
    setFacStart(new Date((f.facture_date) + 'T00:00:00')); setFacEnd(f.facture_end_date ? new Date(f.facture_end_date + 'T00:00:00') : null);
    setFacStatus('impayee'); setFacBonCmd(f.bon_commande || '');
    setLignes(Array.isArray(f.lignes) && f.lignes.length ? f.lignes.map((l: any) => ({ designation: l.designation || '', quantite: Number(l.quantite) || 1, unite: l.unite || 'forfait', prixUnitaire: Number(l.prixUnitaire) || 0 })) : [{ designation: f.prestation || '', quantite: 1, unite: 'forfait', prixUnitaire: Number(f.amount) || 0 }]);
    setShowFac(true);
  }
  function pickSociete(s: any) { setFacClient(s.nom); setFacAddr(s.adresse || ''); }

  async function saveFacture() {
    if (!uid) return;
    const valid = lignes.filter((l) => (l.designation || '').trim());
    if (!facClient.trim()) { showAlert('Client manquant', 'Indique le client.'); return; }
    if (!valid.length) { showAlert('Prestation manquante', 'Ajoute au moins une prestation.'); return; }
    setSaving(true);
    const total = valid.reduce((a, l) => a + l.quantite * l.prixUnitaire, 0);
    const startISO = iso(facStart);
    const endISO = facEnd ? iso(facEnd) : null;
    const payload: any = {
      user_id: uid, client: facClient.trim(), client_address: facAddr.trim() || null,
      prestation: valid.map((l) => l.designation).join(', '), lignes: valid,
      facture_date: startISO, facture_end_date: endISO && endISO !== startISO ? endISO : null,
      amount: total, status: facStatus, type: docType, bon_commande: facBonCmd.trim() || null,
    };
    if (!facEditId) {
      const yr = startISO.slice(0, 4);
      if (docType === 'devis') {
        const dnums = factures.filter((f) => (f.numero || '').startsWith('D-' + yr + '-')).map((f) => Number((f.numero || '').split('-')[2]) || 0);
        payload.numero = `D-${yr}-${String((dnums.length ? Math.max(...dnums) : 0) + 1).padStart(3, '0')}`;
      } else {
        const nums = factures.filter((f) => (f.numero || '').startsWith(yr + '-') && f.type !== 'devis').map((f) => Number((f.numero || '').split('-')[1]) || 0);
        payload.numero = `${yr}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
      }
    }
    const res = facEditId ? await supabase.from('factures').update(payload).eq('id', facEditId) : await supabase.from('factures').insert(payload);
    setSaving(false);
    if (res.error) { showAlert('Erreur', res.error.message); return; }
    setShowFac(false); load();
  }
  function deleteFacture() {
    if (!facEditId) return;
    showAlert('Supprimer ?', 'Cette facture sera supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { const { error } = await supabase.from('factures').delete().eq('id', facEditId); if (error) { showAlert('Erreur', error.message); return; } setShowFac(false); load(); } },
    ]);
  }

  async function generatePdf(f: any) {
    if (!profile.nom || !profile.siret) { showAlert('Infos manquantes', 'Renseigne ton nom et ton SIRET dans « Mes informations ».'); return; }
    const lp = (Array.isArray(f.lignes) && f.lignes.length) ? f.lignes : [{ designation: f.prestation, quantite: '', unite: '', prixUnitaire: f.amount }];
    const rows = lp.map((l: any) => {
      const tot = (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) || (Array.isArray(f.lignes) && f.lignes.length ? 0 : Number(f.amount) || 0);
      const qte = l.quantite === '' || l.quantite == null ? '' : `${l.quantite} ${l.unite || ''}`.trim();
      const pu = l.prixUnitaire == null || l.prixUnitaire === '' ? '' : money2(Number(l.prixUnitaire));
      return `<tr><td>${esc(l.designation || '')}</td><td>${esc(qte)}</td><td class="r">${pu}</td><td class="r">${money2(tot)}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,Helvetica,sans-serif;color:#0D1B2A;font-size:13px;}
.top{background:linear-gradient(135deg,#0D4F6C,#12754A);color:#fff;padding:30px 36px;display:flex;justify-content:space-between;}
.top h1{font-size:28px;letter-spacing:.06em;}.meta{margin-top:8px;font-size:12px;opacity:.92;line-height:1.5;}
.seller{text-align:right;font-size:12px;line-height:1.5;}.seller .n{font-size:15px;font-weight:800;}
.c{padding:28px 36px;}.lbl{color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
.cli{font-size:15px;font-weight:700;color:#0D4F6C;margin-top:2px;}
table{width:100%;border-collapse:collapse;margin:22px 0;}thead th{background:#0D4F6C;color:#fff;text-align:left;padding:10px;font-size:11px;text-transform:uppercase;}
thead th.r,td.r{text-align:right;}tbody td{padding:11px 10px;border-bottom:1px solid #E5E8EB;}
.tot{text-align:right;font-size:20px;font-weight:800;color:#0D4F6C;margin-top:6px;}
.ment{margin-top:36px;font-size:11px;color:#64748B;line-height:1.6;border-top:1px solid #E5E8EB;padding-top:14px;}
.foot{margin-top:22px;text-align:center;font-size:11px;color:#94A3B8;border-top:1px solid #E5E8EB;padding-top:14px;}</style></head><body>
<div class="top"><div><h1>${f.type === 'devis' ? 'DEVIS' : 'FACTURE'}</h1><div class="meta">N° ${esc(f.numero || '—')}<br>Date : ${fmtDate(f.facture_date)}${f.bon_commande ? `<br>Bon de commande : ${esc(f.bon_commande)}` : ''}</div></div>
<div class="seller"><div class="n">${esc(profile.nom)}</div><div style="font-size:11px;opacity:.9;">Entrepreneur individuel (EI)</div>${esc(profile.adresse).replace(/\n/g, '<br>')}<br>SIRET : ${esc(profile.siret)}<br>${esc(profile.contact)}</div></div>
<div class="c"><div class="lbl">Facturé à</div><div class="cli">${esc(f.client)}</div>${esc(f.client_address || '').replace(/\n/g, '<br>')}
<div style="color:#64748B;font-size:12px;margin-top:8px;">Période : ${esc(fmtPeriod(f.facture_date, f.facture_end_date))}</div>
<table><thead><tr><th>Désignation</th><th>Qté</th><th class="r">PU HT</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">Total : ${money2(Number(f.amount))}</div>
<div class="ment">${esc(profile.tva)}<br>${f.type === 'devis' ? 'Devis valable 30 jours. Bon pour accord (date + signature) :' : 'En cas de retard de paiement : indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce).'}<br><span style="font-size:10px;color:#94A3B8;">Document généré à titre d'aide à la gestion via Intermitrack. L'émetteur reste seul responsable de l'exactitude et de la conformité légale de ce document.</span></div>
<div class="foot">${f.type === 'devis' ? 'Devis généré' : 'Facture générée'} avec <b>Intermitrack</b> · intermitrack.fr</div></div></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (e: any) { showAlert('Erreur PDF', e?.message || 'Impossible de générer le PDF.'); }
  }

  // ---- Société ----
  function openNewSoc() { setSocEditId(null); setSocNom(''); setSocType('Client'); setSocAddr(''); setSocTel(''); setSocEmail(''); setSocSiret(''); setShowSoc(true); }
  function openEditSoc(s: any) { setSocEditId(s.id); setSocNom(s.nom || ''); setSocType(s.type || 'Client'); setSocAddr(s.adresse || ''); setSocTel(s.telephone || ''); setSocEmail(s.email || ''); setSocSiret(s.siret || ''); setShowSoc(true); }
  async function saveSociete() {
    if (!uid) return;
    if (!socNom.trim()) { showAlert('Nom manquant', 'Indique le nom de la société.'); return; }
    const payload: any = { user_id: uid, nom: socNom.trim(), type: socType, adresse: socAddr.trim() || null, telephone: socTel.trim() || null, email: socEmail.trim() || null, siret: socSiret.trim() || null };
    const res = socEditId ? await supabase.from('societes').update(payload).eq('id', socEditId) : await supabase.from('societes').insert(payload);
    if (res.error) { showAlert('Erreur', res.error.message); return; }
    setShowSoc(false); load();
  }
  function deleteSociete() {
    if (!socEditId) return;
    showAlert('Supprimer ?', 'Cette société sera supprimée du carnet.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { const { error } = await supabase.from('societes').delete().eq('id', socEditId); if (error) { showAlert('Erreur', error.message); return; } setShowSoc(false); load(); } },
    ]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={C.petrol} /></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Auto-entrepreneur</Text>
        <Text style={s.pageSub}>Factures, chiffre d&apos;affaires et carnet de sociétés</Text>
      </View>

      {/* ===== Tableau de bord ===== */}
      <View style={{ paddingHorizontal: 16, gap: 11, marginBottom: 8 }}>
        {/* CA + plafond */}
        <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>Chiffre d&apos;affaires {year}</Text>
          <Text style={{ fontSize: 30, fontWeight: '800', color: C.petrol, marginTop: 2 }}>{money0(ys.total)}</Text>
          <View style={{ height: 8, borderRadius: 6, backgroundColor: C.line, marginTop: 12, overflow: 'hidden' }}>
            <View style={{ height: '100%', borderRadius: 6, backgroundColor: C.green, width: (pct + '%') as any }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ fontSize: 11, color: C.muted }}>{pct} % du plafond</Text>
            <Text style={{ fontSize: 11, color: C.muted }}>Plafond {money0(AE_PLAFOND)}</Text>
          </View>
        </View>

        {/* URSSAF à provisionner + net estimé */}
        <View style={{ flexDirection: 'row', gap: 11 }}>
          <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.line }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' }}>À provisionner URSSAF</Text>
            <Text style={{ fontSize: 19, fontWeight: '800', color: C.orange, marginTop: 4 }}>≈ {money0(ys.paid * tauxNum)}</Text>
            <Text style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{taux} % du CA encaissé</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.line }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' }}>Net estimé</Text>
            <Text style={{ fontSize: 19, fontWeight: '800', color: C.text, marginTop: 4 }}>≈ {money0(ys.paid * (1 - tauxNum))}</Text>
            <Text style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>après cotisations</Text>
          </View>
        </View>

        {/* Factures encaissé / en attente */}
        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Factures {year}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: C.greenBg, borderRadius: 12, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.green }}>{money0(ys.paid)}</Text>
              <Text style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>Encaissé</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.orangeBg, borderRadius: 12, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.orange }}>{money0(ys.pending)}</Text>
              <Text style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>En attente</Text>
            </View>
          </View>
        </View>

        {/* Jauge TVA */}
        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' }}>Franchise de TVA</Text>
          <View style={{ height: 9, borderRadius: 6, backgroundColor: C.line, marginTop: 9, overflow: 'hidden' }}>
            <View style={{ height: '100%', borderRadius: 6, backgroundColor: C.orange, width: (Math.min(100, Math.round((ys.total / AE_TVA_SEUIL) * 100)) + '%') as any }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ fontSize: 11, color: C.muted }}>{money0(ys.total)}</Text>
            <Text style={{ fontSize: 11, color: C.muted }}>Seuil {money0(AE_TVA_SEUIL)}</Text>
          </View>
          <Text style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            {ys.total < AE_TVA_SEUIL ? `Il te reste ${money0(AE_TVA_SEUIL - ys.total)} avant de devoir facturer la TVA.` : 'Seuil de franchise dépassé — TVA applicable.'}
          </Text>
        </View>

        {/* Actions rapides */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => openNewFacture('devis')} activeOpacity={0.85} style={{ flex: 1, flexDirection: 'row', gap: 5, borderRadius: 13, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line }}>
            <Ionicons name="add" size={16} color={C.petrol} /><Text style={{ color: C.petrol, fontWeight: '800', fontSize: 12.5 }}>Devis</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openNewFacture('facture')} activeOpacity={0.85} style={{ flex: 1, flexDirection: 'row', gap: 5, borderRadius: 13, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line }}>
            <Ionicons name="add" size={16} color={C.petrol} /><Text style={{ color: C.petrol, fontWeight: '800', fontSize: 12.5 }}>Facture</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowClients(true)} activeOpacity={0.85} style={{ flex: 1, flexDirection: 'row', gap: 5, borderRadius: 13, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line }}>
            <Ionicons name="people-outline" size={16} color={C.petrol} /><Text style={{ color: C.petrol, fontWeight: '800', fontSize: 12.5 }}>Clients</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={s.infoBtn} onPress={() => setShowProfile(true)}>
        <View style={{flexDirection:'row',alignItems:'center',gap:5,flex:1}}><Ionicons name="receipt-outline" size={13} color={C.petrol} /><Text style={s.infoBtnTxt}>Mes informations (pour les factures)</Text></View>
        <Text style={s.infoBtnArrow}>Modifier ›</Text>
      </TouchableOpacity>

      {/* Factures */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Mes factures</Text>
      </View>
      <View style={s.filterBar}>
        {([['all', 'Tout'], ['payee', 'Payées'], ['impayee', 'À encaisser']] as const).map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[s.filterChip, filter === k && s.filterOn]} onPress={() => setFilter(k)}>
            <Text style={filter === k ? s.filterTxtOn : s.filterTxt}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {filtered.length === 0 ? <Text style={s.empty}>Aucune facture.</Text> : filtered.map((f) => (
          <View key={f.id} style={s.facCard}>
            <View style={s.facTop}>
              <Text style={s.facClient} numberOfLines={1}>{f.client}</Text>
              {f.type === 'devis' ? (
                <View style={[s.statusPill, { backgroundColor: C.orangeBg }]}><Text style={[s.statusTxt, { color: C.orange }]}>Devis</Text></View>
              ) : (
                <View style={[s.statusPill, { backgroundColor: f.status === 'payee' ? C.greenBg : C.orangeBg }]}>
                  <Text style={[s.statusTxt, { color: f.status === 'payee' ? C.green : C.orange }]}>{f.status === 'payee' ? 'Payée' : 'À encaisser'}</Text>
                </View>
              )}
            </View>
            <Text style={s.facMeta} numberOfLines={1}>{f.prestation}</Text>
            <Text style={s.facMeta}>{f.numero ? 'N° ' + f.numero + ' · ' : ''}{fmtPeriod(f.facture_date, f.facture_end_date)}</Text>
            <View style={s.facBottom}>
              <Text style={s.facAmount}>{money2(Number(f.amount))}</Text>
              <View style={s.facActions}>
                {f.type === 'devis' && <TouchableOpacity style={s.ghostBtn} onPress={() => convertToFacture(f)}><Text style={[s.ghostBtnTxt, { color: C.green }]}>→ Facture</Text></TouchableOpacity>}
                <GradientButton label="PDF" onPress={() => generatePdf(f)} style={s.pdfBtn} textStyle={s.pdfBtnTxt} />
                <TouchableOpacity style={s.ghostBtn} onPress={() => openEditFacture(f)}><Text style={s.ghostBtnTxt}>Modifier</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* CA + infos */}
      <View style={s.card}>
        <View style={s.monthRow}>
          <TouchableOpacity onPress={() => shiftMonth(-1)} style={s.monthBtn}><Text style={s.monthBtnTxt}>‹</Text></TouchableOpacity>
          <Text style={s.monthLbl}>{new Date(month + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => shiftMonth(1)} style={s.monthBtn}><Text style={s.monthBtnTxt}>›</Text></TouchableOpacity>
        </View>
        <Row s={s} label="CA encaissé (mois)" value={money2(ms.paid)} hl />
        <Row s={s} label="En attente (mois)" value={money2(ms.pending)} />
        <Row s={s} label="Cotisations URSSAF (mois)" value={money2(ms.paid * tauxNum)} />
        <View style={s.sep} />
        <Row s={s} label={`CA encaissé (année ${year})`} value={money2(ys.paid)} hl />
        <Row s={s} label="En attente (année)" value={money2(ys.pending)} />
        <Row s={s} label="Cotisations URSSAF (année)" value={money2(ys.paid * tauxNum)} />
        <View style={s.plafondBox}>
          <Text style={s.plafondTxt}>Plafond micro : {money0(AE_PLAFOND)}</Text>
          <Text style={s.plafondTxt}>CA {year} : {money2(ys.total)} ({pct} %)</Text>
        </View>
        <Text style={s.label}>Taux de cotisation URSSAF (%)</Text>
        <NumInput style={s.input} value={taux} onChangeText={saveTaux} />
        <Text style={s.hint}>Selon ton activité : ~21,2 % (BIC) ou ~24,6 % (BNC). À vérifier sur autoentrepreneur.urssaf.fr</Text>
      </View>

      {/* ===== Modale Facture ===== */}
      <Modal visible={showFac && !showPresta} animationType="slide" transparent onRequestClose={() => setShowFac(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.overlay}>
            <View style={[s.modalCard, { paddingBottom: 22 + insets.bottom }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.modalTitle}>{facEditId ? (docType === 'devis' ? 'Modifier le devis' : 'Modifier la facture') : (docType === 'devis' ? 'Nouveau devis' : 'Nouvelle facture')}</Text>

                {societes.length > 0 && (
                  <>
                    <Text style={s.label}>Société (carnet)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      {societes.map((soc) => (
                        <TouchableOpacity key={soc.id} style={s.chip} onPress={() => pickSociete(soc)}><Text style={s.chipTxt}>{soc.nom}</Text></TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={s.label}>Client</Text>
                <TextInput style={s.input} value={facClient} onChangeText={setFacClient} placeholder="Nom du client" placeholderTextColor={C.muted} />
                <Text style={s.label}>Adresse du client (optionnel)</Text>
                <AddressInput style={s.input} value={facAddr} onChangeText={setFacAddr} placeholder="Commence à taper, choisis dans la liste" />
                {docType === 'facture' && (
                  <>
                    <Text style={s.label}>N° de bon de commande (optionnel)</Text>
                    <TextInput style={s.input} value={facBonCmd} onChangeText={setFacBonCmd} placeholder="Ex : 26-2038" placeholderTextColor={C.muted} />
                  </>
                )}

                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Date (début)</Text>
                    <TouchableOpacity style={s.input} onPress={() => setShowStart(true)}><Text style={s.inputTxt}>{facStart.toLocaleDateString('fr-FR')}</Text></TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Date fin (option)</Text>
                    <TouchableOpacity style={s.input} onPress={() => setShowEnd(true)}><Text style={s.inputTxt}>{facEnd ? facEnd.toLocaleDateString('fr-FR') : '—'}</Text></TouchableOpacity>
                  </View>
                </View>
                {showStart && <DateTimePicker value={facStart} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setShowStart(false); if (d) setFacStart(d); }} />}
                {showEnd && <DateTimePicker value={facEnd || facStart} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setShowEnd(false); if (d) setFacEnd(d); }} />}

                <Text style={s.label}>Prestations</Text>
                <TouchableOpacity style={s.addPrestaBtn} onPress={() => { setPrestaSel([]); setShowPresta(true); }}><Text style={s.addPrestaTxt}>+ Ajouter une prestation</Text></TouchableOpacity>

                {lignes.map((l, i) => (
                  <View key={i} style={s.ligneCard}>
                    <TextInput style={[s.input, { marginBottom: 6 }]} value={l.designation} onChangeText={(t) => updLigne(i, { designation: t })} placeholder="Désignation" placeholderTextColor={C.muted} />
                    <View style={s.row}>
                      <View style={{ width: 70 }}><NumInput style={s.input} value={String(l.quantite)} onChangeText={(t: string) => updLigne(i, { quantite: Number(t) || 0 })} /></View>
                      <View style={s.uniteWrap}>
                        {UNITES.map((u) => (
                          <TouchableOpacity key={u} style={[s.uniteChip, l.unite === u && s.uniteOn]} onPress={() => updLigne(i, { unite: u })}><Text style={l.unite === u ? s.uniteTxtOn : s.uniteTxt}>{u}</Text></TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={[s.row, { marginTop: 6, alignItems: 'center' }]}>
                      <View style={{ flex: 1 }}><NumInput style={s.input} value={String(l.prixUnitaire || '')} onChangeText={(t: string) => updLigne(i, { prixUnitaire: Number(t) || 0 })} placeholder="PU HT €" placeholderTextColor={C.muted} /></View>
                      <Text style={s.ligneTot}>{money2((Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0))}</Text>
                      <TouchableOpacity onPress={() => delLigne(i)} style={s.ligneDel}><Text style={s.ligneDelTxt}>✕</Text></TouchableOpacity>
                    </View>
                  </View>
                ))}

                <View style={s.totalRow}><Text style={s.totalLbl}>Total facture</Text><Text style={s.totalVal}>{money2(lignesTotal)}</Text></View>

                <Text style={s.label}>Statut</Text>
                <View style={s.row}>
                  <TouchableOpacity style={[s.statusChip, facStatus === 'impayee' && s.statusChipOn]} onPress={() => setFacStatus('impayee')}><Text style={facStatus === 'impayee' ? s.uniteTxtOn : s.uniteTxt}>À encaisser</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.statusChip, facStatus === 'payee' && s.statusChipOn]} onPress={() => setFacStatus('payee')}><Text style={facStatus === 'payee' ? s.uniteTxtOn : s.uniteTxt}>Payée</Text></TouchableOpacity>
                </View>

                <GradientButton label={saving ? 'Enregistrement…' : 'Enregistrer la facture'} onPress={saveFacture} disabled={saving} style={s.saveBtn} textStyle={s.saveBtnTxt} />
                {facEditId && <TouchableOpacity style={s.deleteBtn} onPress={deleteFacture}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Ionicons name="trash-outline" size={15} color={C.danger}/><Text style={s.deleteBtnTxt}>Supprimer</Text></View></TouchableOpacity>}
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowFac(false)}><Text style={s.cancelBtnTxt}>Annuler</Text></TouchableOpacity>
                <Text style={s.disclaimer}>ℹ️ Intermitrack est un outil d&apos;aide à la gestion : tu restes seul responsable de l&apos;exactitude et de la conformité légale de tes factures (numérotation, SIRET, « TVA non applicable, art. 293 B du CGI »). À noter : la facturation électronique B2B deviendra obligatoire (réforme 2026-2027). En cas de doute, rapproche-toi d&apos;un expert-comptable.</Text>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Modale Prestations ===== */}
      <Modal visible={showPresta} animationType="slide" transparent onRequestClose={() => setShowPresta(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.overlay}>
            <View style={[s.modalCard, { paddingBottom: 22 + insets.bottom }]}>
              <Text style={s.modalTitle}>Ajouter des prestations</Text>
              <Text style={[s.hint, { textAlign: 'center' }]}>Coche celles à ajouter à la facture.</Text>
              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {PRESTA_OPTIONS.concat(customPresta).map((p) => {
                  const on = prestaSel.includes(p);
                  const isCustom = customPresta.includes(p);
                  return (
                    <TouchableOpacity key={p} style={[s.prestaRow, on && s.prestaRowOn]} onPress={() => setPrestaSel(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}>
                      <View style={[s.prestaCheck, on && s.prestaCheckOn]}>{on && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>✓</Text>}</View>
                      <Text style={s.prestaRowTxt}>{p}</Text>
                      {isCustom && <TouchableOpacity onPress={() => removeCustomPresta(p)} hitSlop={8}><Ionicons name="trash-outline" size={16} color={C.muted} /></TouchableOpacity>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={[s.row, { marginTop: 10 }]}>
                <TextInput style={[s.input, { flex: 1 }]} value={prestaCustom} onChangeText={setPrestaCustom} placeholder="Prestation personnalisée…" placeholderTextColor={C.muted} />
                <TouchableOpacity style={s.prestaAddBtn} onPress={() => { const v = prestaCustom.trim(); if (v) { addCustomPresta(v); setPrestaCustom(''); } }}><Text style={s.prestaAddTxt}>Ajouter</Text></TouchableOpacity>
              </View>
              <GradientButton label="Ajouter la sélection" onPress={() => { prestaSel.forEach(p => addLigne(p)); setPrestaSel([]); setShowPresta(false); }} style={s.saveBtn} textStyle={s.saveBtnTxt} />
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setPrestaSel([]); setShowPresta(false); }}><Text style={s.cancelBtnTxt}>Annuler</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Modale Profil ===== */}
      <Modal visible={showProfile} animationType="slide" transparent onRequestClose={() => setShowProfile(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.overlay}>
            <View style={[s.modalCard, { paddingBottom: 22 + insets.bottom }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.modalTitle}>Mes informations</Text>
                <Text style={s.hint}>Elles apparaissent en haut de tes factures PDF.</Text>
                <Text style={s.label}>Nom / raison sociale</Text>
                <TextInput style={s.input} value={profile.nom} onChangeText={(t) => setProfile((p: any) => ({ ...p, nom: t }))} placeholder="Ex : Jean Dupont" placeholderTextColor={C.muted} />
                <Text style={s.label}>SIRET</Text>
                <TextInput style={s.input} value={profile.siret} onChangeText={(t) => setProfile((p: any) => ({ ...p, siret: t }))} placeholder="Ex : 123 456 789 00012" placeholderTextColor={C.muted} />
                <Text style={s.label}>Adresse</Text>
                <TextInput style={s.input} value={profile.adresse} onChangeText={(t) => setProfile((p: any) => ({ ...p, adresse: t }))} placeholder="N°, rue, code postal, ville" placeholderTextColor={C.muted} />
                <Text style={s.label}>Email / téléphone</Text>
                <TextInput style={s.input} value={profile.contact} onChangeText={(t) => setProfile((p: any) => ({ ...p, contact: t }))} placeholder="email · téléphone" placeholderTextColor={C.muted} autoCapitalize="none" />
                <Text style={s.label}>Mention TVA</Text>
                <TextInput style={s.input} value={profile.tva} onChangeText={(t) => setProfile((p: any) => ({ ...p, tva: t }))} placeholderTextColor={C.muted} />
                <GradientButton label="Enregistrer mes informations" onPress={saveProfile} style={s.saveBtn} textStyle={s.saveBtnTxt} />
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowProfile(false)}><Text style={s.cancelBtnTxt}>Fermer</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Pop-up Clients (liste + ajout) ===== */}
      <Modal visible={showClients && !showSoc} animationType="slide" transparent onRequestClose={() => setShowClients(false)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, { paddingBottom: 22 + insets.bottom }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={s.modalTitle}>Mes clients</Text>
              <TouchableOpacity onPress={() => setShowClients(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
            </View>
            <GradientButton label="+ Ajouter un client" onPress={openNewSoc} style={s.addBtn} textStyle={s.addBtnTxt} />
            {societes.length === 0 ? (
              <Text style={[s.empty, { marginTop: 16 }]}>Aucun client pour l&apos;instant. Touche « + Ajouter un client ».</Text>
            ) : (
              <ScrollView style={{ marginTop: 12, maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {societes.map((soc) => (
                  <TouchableOpacity key={soc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }} onPress={() => openEditSoc(soc)}>
                    <LinearGradient colors={['#1F4E5F', '#12754A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{(soc.nom || '?').slice(0, 2).toUpperCase()}</Text></LinearGradient>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14.5, fontWeight: '700', color: C.text }} numberOfLines={1}>{soc.nom}</Text>
                      <Text style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>{soc.type}{soc.email ? ' · ' + soc.email : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={C.muted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[s.cancelBtn, { marginTop: 16 }]} onPress={() => setShowClients(false)}><Text style={s.cancelBtnTxt}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Modale Société ===== */}
      <Modal visible={showSoc} animationType="slide" transparent onRequestClose={() => setShowSoc(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.overlay}>
            <View style={[s.modalCard, { paddingBottom: 22 + insets.bottom }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.modalTitle}>{socEditId ? 'Modifier la société' : 'Nouvelle société'}</Text>
                <Text style={s.label}>Nom de la société</Text>
                <TextInput style={s.input} value={socNom} onChangeText={setSocNom} placeholder="Ex : Studio Lumière Productions" placeholderTextColor={C.muted} />
                <Text style={s.label}>Type</Text>
                <View style={s.uniteWrap}>
                  {TYPES_SOC.map((t) => (
                    <TouchableOpacity key={t} style={[s.uniteChip, socType === t && s.uniteOn]} onPress={() => setSocType(t)}><Text style={socType === t ? s.uniteTxtOn : s.uniteTxt}>{t}</Text></TouchableOpacity>
                  ))}
                </View>
                <Text style={s.label}>Adresse</Text>
                <AddressInput style={s.input} value={socAddr} onChangeText={setSocAddr} placeholder="Commence à taper, choisis dans la liste" />
                <Text style={s.label}>Téléphone</Text>
                <TxtInput style={s.input} value={socTel} onChangeText={setSocTel} placeholder="06…" placeholderTextColor={C.muted} keyboardType="phone-pad" />
                <Text style={s.label}>Email</Text>
                <TextInput style={s.input} value={socEmail} onChangeText={setSocEmail} placeholder="contact@exemple.fr" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" />
                <Text style={s.label}>SIRET (optionnel)</Text>
                <TextInput style={s.input} value={socSiret} onChangeText={setSocSiret} placeholder="SIRET" placeholderTextColor={C.muted} />
                <GradientButton label="Enregistrer la société" onPress={saveSociete} style={s.saveBtn} textStyle={s.saveBtnTxt} />
                {socEditId && <TouchableOpacity style={s.deleteBtn} onPress={deleteSociete}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Ionicons name="trash-outline" size={15} color={C.danger}/><Text style={s.deleteBtnTxt}>Supprimer</Text></View></TouchableOpacity>}
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSoc(false)}><Text style={s.cancelBtnTxt}>Annuler</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function esc(v: string) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function Row({ s, label, value, hl }: { s: any; label: string; value: string; hl?: boolean }) {
  return (
    <View style={[s.resultRow, hl && s.resultHL]}>
      <Text style={s.resultLbl}>{label}</Text>
      <Text style={s.resultVal}>{value}</Text>
    </View>
  );
}

const makeS = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageHeader: { backgroundColor: C.card, padding: 18, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: C.line },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.petrol, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: C.muted, marginTop: 4 },
  card: { backgroundColor: C.card, margin: 16, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  monthBtnTxt: { fontSize: 22, color: C.petrol, fontWeight: '800' },
  monthLbl: { fontSize: 15, fontWeight: '800', color: C.petrol, textTransform: 'capitalize' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 11, backgroundColor: C.soft, borderWidth: 1, borderColor: C.line, marginBottom: 6, gap: 10 },
  resultHL: { backgroundColor: 'rgba(31,78,95,0.06)', borderColor: 'rgba(31,78,95,0.14)' },
  resultLbl: { fontSize: 13, fontWeight: '700', color: C.petrol, flex: 1 },
  resultVal: { fontSize: 14, fontWeight: '800', color: C.petrol },
  sep: { height: 1, backgroundColor: C.line, marginVertical: 10 },
  plafondBox: { backgroundColor: C.soft, borderRadius: 12, padding: 12, marginTop: 6 },
  plafondTxt: { fontSize: 12, fontWeight: '700', color: C.petrol },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 16 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.card },
  inputTxt: { fontSize: 15, color: C.text },
  infoBtn: { marginHorizontal: 16, marginTop: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoBtnTxt: { fontSize: 13, fontWeight: '700', color: C.petrol, flex: 1 },
  infoBtnArrow: { fontSize: 13, fontWeight: '800', color: C.petrol },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.petrol },
  addBtn: { backgroundColor: C.petrol, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  addBtnTxt: { color: 'white', fontWeight: '800', fontSize: 13 },
  filterBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  filterChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  filterOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  filterTxt: { fontSize: 12, fontWeight: '700', color: C.petrol },
  filterTxtOn: { fontSize: 12, fontWeight: '700', color: 'white' },
  empty: { textAlign: 'center', color: C.muted, padding: 20 },
  facCard: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(31,78,95,0.12)', borderLeftWidth: 4, borderLeftColor: C.petrol, gap: 5, shadowColor: '#0D1B2A', shadowOpacity: 0.06, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  facTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  facClient: { fontSize: 15, fontWeight: '900', color: C.petrol, flex: 1 },
  statusPill: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  statusTxt: { fontSize: 10, fontWeight: '800' },
  facMeta: { fontSize: 12, color: C.muted },
  facBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  facAmount: { fontSize: 21, fontWeight: '900', color: C.petrol },
  facActions: { flexDirection: 'row', gap: 8 },
  pdfBtn: { backgroundColor: C.petrol, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  pdfBtnTxt: { color: 'white', fontWeight: '800', fontSize: 13 },
  ghostBtn: { backgroundColor: C.soft, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  ghostBtnTxt: { color: C.petrol, fontWeight: '800', fontSize: 13 },
  socCard: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  socAv: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  socAvTxt: { color: 'white', fontWeight: '900', fontSize: 13 },
  socName: { fontSize: 14, fontWeight: '900', color: C.petrol },
  socType: { fontSize: 12, fontWeight: '700', color: C.muted },
  socMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  socGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  socChip: { width: '31%', backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 5, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  socChipName: { fontSize: 11.5, fontWeight: '800', color: C.petrol, marginTop: 7, maxWidth: '100%', textAlign: 'center' },
  socChipType: { fontSize: 10, color: C.muted, marginTop: 1 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 },
  pageBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  pageBtnOff: { opacity: 0.4 },
  pageBtnTxt: { fontSize: 20, color: C.petrol, fontWeight: '800' },
  pageInd: { fontSize: 13, fontWeight: '700', color: C.muted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.petrol, marginBottom: 8, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  chip: { backgroundColor: C.soft, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  chipTxt: { fontSize: 13, fontWeight: '700', color: C.petrol },
  prestaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  prestaChip: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 },
  prestaChipTxt: { fontSize: 12, fontWeight: '700', color: C.petrol },
  addPrestaBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.petrol, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: C.soft, marginTop: 4 },
  addPrestaTxt: { color: C.petrol, fontWeight: '800', fontSize: 14 },
  prestaRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, marginBottom: 8 },
  prestaRowOn: { borderColor: C.petrol, backgroundColor: C.soft },
  prestaCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  prestaCheckOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  prestaRowTxt: { flex: 1, fontSize: 13.5, fontWeight: '700', color: C.text },
  prestaAddBtn: { backgroundColor: C.soft, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  prestaAddTxt: { color: C.petrol, fontWeight: '800', fontSize: 13 },
  ligneCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 10, marginTop: 10 },
  uniteWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  uniteChip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 99, backgroundColor: C.soft },
  uniteOn: { backgroundColor: C.petrol },
  uniteTxt: { fontSize: 12, fontWeight: '700', color: C.petrol },
  uniteTxtOn: { fontSize: 12, fontWeight: '700', color: 'white' },
  ligneTot: { fontSize: 14, fontWeight: '800', color: C.petrol, minWidth: 70, textAlign: 'right' },
  ligneDel: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.warnBg, alignItems: 'center', justifyContent: 'center' },
  ligneDelTxt: { color: C.danger, fontWeight: '800', fontSize: 15 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(31,78,95,0.06)' },
  totalLbl: { fontSize: 14, fontWeight: '800', color: C.petrol },
  totalVal: { fontSize: 18, fontWeight: '900', color: C.petrol },
  statusChip: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: C.soft, alignItems: 'center' },
  statusChipOn: { backgroundColor: C.petrol },
  saveBtn: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveBtnTxt: { color: 'white', fontWeight: '800', fontSize: 15 },
  deleteBtn: { backgroundColor: C.warnBg, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  deleteBtnTxt: { color: C.danger, fontWeight: '800', fontSize: 14 },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelBtnTxt: { color: C.muted, fontWeight: '700', fontSize: 14 },
  disclaimer: { fontSize: 11, color: C.muted, lineHeight: 16, marginTop: 14, paddingHorizontal: 4 },
});

export default function AutoEntrepreneur(){ return (<PremiumGate title="Auto-entrepreneur"><AutoEntrepreneurInner/></PremiumGate>); }
