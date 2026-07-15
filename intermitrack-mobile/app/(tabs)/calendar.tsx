import { showAlert } from "../../lib/dialog";
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTheme, useThemeControls } from '../../lib/theme';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Platform, Alert, KeyboardAvoidingView, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTrackView } from '../../lib/analytics';
import NumInput from '../../components/NumInput';
import TxtInput from '../../components/TxtInput';
import AddressInput from '../../components/AddressInput';
import { GradientButton } from '../../components/GradientButton';
import { Ionicons } from '@expo/vector-icons';
import { useProdColors, PROD_PRESETS, prodGradient, textOn } from '../../lib/prodColors';
import { useAnnexe, modeForNew, modeForEdit, computeHoursVac, extraHoursOf, CACHET_H } from '../../lib/annexe';
import { typeParts, addType, removeType } from '../../lib/missionType';
import ProductionPickerModal from '../../components/ProductionPickerModal';
import AddressPickerModal from '../../components/AddressPickerModal';
import { knownFrom, knownTo, useKmDefaults } from '../../lib/kmAddresses';
import ColorPickerModal from '../../components/ColorPickerModal';
import ProdColorManager from '../../components/ProdColorManager';
import NoteFormModal from '../../components/NoteFormModal';
import QuickEntryModal from '../../components/QuickEntryModal';
import NoteDetailModal from '../../components/NoteDetailModal';
import CalendarImportModal from '../../components/CalendarImportModal';
import { syncWidgets } from '../../lib/widgetSync';
import { useNotes, noteAbbr, Note } from '../../lib/notes';
import { usePostes } from '../../lib/postes';
import Svg, { Line } from 'react-native-svg';

// Barème kilométrique officiel : coefficient par tranche de km annuels.
// t1/t2 = seuils des tranches ; c1 (≤t1) · c2·km + add2 (t1→t2) · c3 (>t2).
const BAREME = [
  { key: '3', label: '3 CV', t1: 5000, t2: 20000, c1: 0.529, c2: 0.316, add2: 1065, c3: 0.370 },
  { key: '4', label: '4 CV', t1: 5000, t2: 20000, c1: 0.606, c2: 0.340, add2: 1330, c3: 0.407 },
  { key: '5', label: '5 CV', t1: 5000, t2: 20000, c1: 0.636, c2: 0.357, add2: 1395, c3: 0.427 },
  { key: '6', label: '6 CV', t1: 5000, t2: 20000, c1: 0.665, c2: 0.374, add2: 1457, c3: 0.447 },
  { key: '7', label: '7+ CV', t1: 5000, t2: 20000, c1: 0.697, c2: 0.394, add2: 1515, c3: 0.470 },
  { key: 'moto', label: 'Moto', t1: 3000, t2: 6000, c1: 0.395, c2: 0.099, add2: 891, c3: 0.234 },
];
// La personne choisit sa tranche de km annuels (elle connaît son kilométrage).
const TRANCHE_OPTIONS = [{ key: '1', label: '≤5 000 km/an' }, { key: '2', label: '5 001–20 000' }, { key: '3', label: '>20 000' }];
function pf(v: string) { const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : 0; }
// Coefficient €/km selon la tranche choisie (le forfait annuel des tranches 2/3 n'est pas appliqué par mission).
function kmCoef(cvKey: string, tranche: string) { const b = BAREME.find((x) => x.key === cvKey); if (!b) return 0; return tranche === '2' ? b.c2 : tranche === '3' ? b.c3 : b.c1; }
function trancheLabel(tranche: string) { return tranche === '2' ? '5 001–20 000 km/an' : tranche === '3' ? '> 20 000 km/an' : '≤ 5 000 km/an'; }
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) { const R = 6371, tr = (d: number) => d * Math.PI / 180; const dLat = tr(lat2 - lat1), dLon = tr(lon2 - lon1); const x = Math.sin(dLat / 2) ** 2 + Math.cos(tr(lat1)) * Math.cos(tr(lat2)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

// La palette vient du thème (lib/theme) → const C = useTheme() dans le composant.
const GRAD_PAST: readonly [string, string] = ['#1F4E5F', '#2F8F6B'];   // pétrole → vert (dates passées)
const GRAD_FUTURE: readonly [string, string] = ['#F97316', '#FDBA74']; // orange (dates à venir)
const GRAD_TODAY: readonly [string, string] = ['#2F8F6B', '#1F4E5F'];      // dégradé des dates passées, INVERSÉ (vert → pétrole)
const GRAD_TODAY_GLOW: readonly [string, string] = ['#54C194', '#2C6E83']; // halo clair qui pulse en douceur

function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function iso(d:Date){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function monthLabel(d:Date){const l=d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});return l.charAt(0).toUpperCase()+l.slice(1);}
const MONTHS_FR=['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
function frDay(ds:string){return new Date(ds+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});}
function daysInclusive(a:Date,b:Date){return Math.max(1,Math.round((b.getTime()-a.getTime())/86400000)+1);}
function isNextDay(aStr:string,bStr:string){const a=new Date(aStr+'T00:00:00');a.setDate(a.getDate()+1);return iso(a)===bStr;}

export default function Calendar(){
  useTrackView('calendar');
  const C = useTheme();
  const { scheme } = useThemeControls();
  const s = useMemo(() => makeS(C), [C]);
  // Dégradés par défaut des jours SANS couleur perso — suivent le thème (or en Noir & Or, etc.).
  const GRAD_PAST_T: [string, string] = [C.petrol, C.green];
  const GRAD_FUTURE_T = prodGradient(C.orange);
  const { getColor, setColor, custom, addCustom, reset } = useProdColors();
  const [colorPickerOpen,setColorPickerOpen]=useState(false);
  const [managerOpen,setManagerOpen]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [importMode,setImportMode]=useState<'calendar'|'excel'>('calendar');
  const { notes, notesForDate } = useNotes();
  const [noteFormOpen,setNoteFormOpen]=useState(false);
  const [noteFormEdit,setNoteFormEdit]=useState<Note|null>(null);
  const [noteFormDate,setNoteFormDate]=useState('');
  const [noteFormMode,setNoteFormMode]=useState<'note'|'formation'>('note');
  const [quickOpen,setQuickOpen]=useState(false);
  const [quickDate,setQuickDate]=useState('');
  const [noteDetail,setNoteDetail]=useState<Note|null>(null);
  const [calTab,setCalTab]=useState<'missions'|'notes'>('missions');
  const { postes, addPoste, removePoste } = usePostes();
  const [fLieu,setFLieu]=useState('');
  const [showLieuSuggest,setShowLieuSuggest]=useState(false);
  const [newPoste,setNewPoste]=useState('');
  const insets=useSafeAreaInsets();
  const [missions,setMissions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [current,setCurrent]=useState(new Date());
  const [page,setPage]=useState(0);
  const [showMonthPicker,setShowMonthPicker]=useState(false);
  const [pickerYear,setPickerYear]=useState(new Date().getFullYear());

  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState<string|null>(null);
  const [fProduction,setFProduction]=useState('');
  const [fEmission,setFEmission]=useState('');
  const [fType,setFType]=useState('Montage');
  const [showTypePicker,setShowTypePicker]=useState(false);
  // true = le choix s'AJOUTE au type courant (« Rec + MIX ») ; false = il le remplace (cas courant).
  const [typeAddMode,setTypeAddMode]=useState(false);
  const [fVacations,setFVacations]=useState('');
  const [dayMenu,setDayMenu]=useState<{date:Date;missions:any[]}|null>(null);
  const [fStart,setFStart]=useState(new Date());
  const [fEnd,setFEnd]=useState(new Date());
  const [fRegime,setFRegime]=useState<'intermittence'|'general'|'enseignement'>('intermittence');
  // Saisie heures vs cachets, pilotée par l'annexe du profil (parite avec le site).
  const annexe=useAnnexe();
  const [fMode,setFMode]=useState<'heures'|'cachet'>('heures');
  const [fCachets,setFCachets]=useState('');
  const [fHours,setFHours]=useState('');
  const [fGross,setFGross]=useState('');
  const [showStartPicker,setShowStartPicker]=useState(false);
  const [showEndPicker,setShowEndPicker]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showProdPicker,setShowProdPicker]=useState(false);
  const [showEmSuggest,setShowEmSuggest]=useState(false);

  const [kmOpen,setKmOpen]=useState(false);
  const [kmFrom,setKmFrom]=useState('');
  const [kmTo,setKmTo]=useState('');
  const [kmFromCoords,setKmFromCoords]=useState<number[]|null>(null);
  const [kmToCoords,setKmToCoords]=useState<number[]|null>(null);
  const [kmRT,setKmRT]=useState(false);
  const [kmEveryDay,setKmEveryDay]=useState(false);
  const [kmJustify,setKmJustify]=useState(false);
  const [kmCv,setKmCv]=useState('');
  const [kmTranche,setKmTranche]=useState('1');
  const [showFromPicker,setShowFromPicker]=useState(false);
  const [showToPicker,setShowToPicker]=useState(false);
  // Vehicule memorise dans « Mes informations » : pre-remplit chaque mission, reste modifiable ici.
  const kmDefaults=useKmDefaults();
  const [kmDistance,setKmDistance]=useState('');
  const [kmRate,setKmRate]=useState('');
  const [kmCalc,setKmCalc]=useState(false);

  const [showMdp,setShowMdp]=useState(false);
  const [mdpDays,setMdpDays]=useState<{date:string;checked:boolean;hours:number}[]>([]);

  const pulse=useRef(new Animated.Value(0)).current;
  useEffect(()=>{loadMissions();},[]);
  useFocusEffect(useCallback(()=>{
    loadMissions(true);
    const loop=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:1,duration:850,useNativeDriver:true}),Animated.timing(pulse,{toValue:0,duration:850,useNativeDriver:true})]));
    loop.start();
    return()=>loop.stop();
  },[pulse]));
  async function loadMissions(silent=false){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:true});
    if(data){ setMissions(data); syncWidgets(data, getColor, notes); }
    if(!silent)setLoading(false);
  }

  // regime : 'intermittence' (défaut) | 'general' (hors 507 h) | 'enseignement' (compte, plafonné)
  function openCreate(day:Date, regime:'intermittence'|'general'='intermittence'){
    setEditId(null);
    setFRegime(regime);
    setFProduction(''); setFEmission(''); setFLieu(''); setShowLieuSuggest(false); setNewPoste(''); setFType('Montage'); setFStart(day); setFEnd(day);
    setShowTypePicker(false); setTypeAddMode(false);
    setFMode(modeForNew(annexe)); setFCachets('');
    setFHours(''); setFGross(''); setFVacations(''); setMdpDays([]);
    setKmOpen(false); setKmFrom(''); setKmTo(''); setKmFromCoords(null); setKmToCoords(null); setKmRT(false); setKmEveryDay(false); setKmJustify(false); setKmDistance(''); setKmRate('');
    // Vehicule pre-rempli depuis « Mes informations » : « je ne change pas ma voiture » (JB). Reste modifiable.
    setKmCv(kmDefaults.cv); setKmTranche(kmDefaults.tranche);
    setShowFromPicker(false); setShowToPicker(false);
    setShowEmSuggest(false);
    setShowForm(true);
  }
  function openEdit(m:any){
    setEditId(m.id);
    setFRegime(m.regime||'intermittence');
    setFProduction(m.production||''); setFEmission(m.emission||''); setFLieu(m.lieu||''); setShowLieuSuggest(false); setNewPoste(''); setFType(m.mission_type||'Montage');
    setShowTypePicker(false); setTypeAddMode(false);
    setFStart(new Date((m.mission_date)+'T00:00:00'));
    setFEnd(new Date((m.end_date||m.mission_date)+'T00:00:00'));
    // Relecture selon le mode : en cachet, le champ heures ne contient que les heures EN PLUS des cachets.
    const _h=Number(m.hours||0), _v=Number(m.vacations||0);
    const _mode=modeForEdit(annexe,_h,_v);
    setFMode(_mode);
    if(_mode==='cachet'){ setFCachets(String(_v||'')); setFHours(String(extraHoursOf(_h,_v)||'')); }
    else { setFCachets(''); setFHours(String(m.hours||'')); }
    setFGross(String(m.gross_amount||'')); setFVacations(String(m.vacations||''));
    // Les adresses sont enfin relues : elles n'etaient enregistrees NULLE PART avant le 15/07/2026,
    // d'ou le retour « les adresses n'apparaissent pas quand je modifie une mission ».
    setKmFrom(m.km_from||''); setKmTo(m.km_to||'');
    setKmFromCoords(m.km_from_lat!=null&&m.km_from_lng!=null?[Number(m.km_from_lng),Number(m.km_from_lat)]:null);
    setKmToCoords(m.km_to_lat!=null&&m.km_to_lng!=null?[Number(m.km_to_lng),Number(m.km_to_lat)]:null);
    setKmRT(false); setKmEveryDay(false); setKmJustify(false);
    // Le CV n'est pas stocke par mission (seul le taux l'est) : on reprend celui du profil, sinon
    // l'estimation affichee retombait a 0 a la reouverture d'une mission saisie au bareme.
    setKmCv(kmDefaults.cv); setKmTranche(kmDefaults.tranche);
    setShowFromPicker(false); setShowToPicker(false);
    setKmDistance(m.km_distance?String(m.km_distance):''); setKmRate(m.km_rate?String(m.km_rate):'');
    setKmOpen(!!(m.km_distance||m.km_amount));
    setShowEmSuggest(false);
    setShowForm(true);
  }

  async function calcKm(){
    if(!kmFrom.trim()||!kmTo.trim()){ showAlert('Adresses manquantes','Indique le lieu de départ et d\'arrivée.'); return; }
    setKmCalc(true);
    try{
      const geo=async(q:string)=>{const r=await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q='+encodeURIComponent(q));const j=await r.json();if(!j.features||!j.features.length)throw new Error('Adresse introuvable : '+q);return j.features[0].geometry.coordinates;};
      const a=kmFromCoords||await geo(kmFrom), b=kmToCoords||await geo(kmTo);
      let km:number|null=null;
      try{const rr=await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false`);const rj=await rr.json();if(rj.routes&&rj.routes[0])km=rj.routes[0].distance/1000;}catch{}
      if(km==null)km=haversineKm(a[1],a[0],b[1],b[0])*1.3;
      setKmDistance(String(Math.round(km)));
    }catch(e:any){ showAlert('Erreur',e?.message||'Impossible de calculer la distance.'); }
    finally{ setKmCalc(false); }
  }
  // Distance totale = trajet × (aller-retour ? 2) × (chaque jour ? nb jours travaillés)
  // Plafond domicile-travail : 40 km par trajet, sauf si l'utilisateur justifie une distance plus longue.
  function kmBase(){ return kmJustify ? pf(kmDistance) : Math.min(pf(kmDistance), 40); }
  function kmEff(nbDays:number){ return kmBase()*(kmRT?2:1)*(kmEveryDay?Math.max(1,nbDays):1); }
  // Jours travaillés = heures ÷ 8, plafonné à la durée de la période (pas la durée calendaire seule).
  const kmWorkedDays = Math.max(1, Math.min(daysInclusive(fStart,fEnd), Math.round(pf(fHours)/8)));
  // Frais : barème officiel si une puissance est choisie (s'adapte à la tranche de km), sinon taux manuel.
  function kmFraisFor(nbDays:number){ const e=kmEff(nbDays); return kmCv ? e*kmCoef(kmCv,kmTranche) : pf(kmRate)*e; }

  async function saveSimple(){
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user){ showAlert('Erreur','Tu n\'es plus connecté.'); setSaving(false); return; }
    const startISO=iso(fStart), endISO=iso(fEnd);
    // En cachet : heures = cachets x 12 + heures payées en heures ; vacations = nb de cachets.
    const hv=computeHoursVac(fMode,Number(fCachets)||0,Number(fHours)||0,Number(fVacations)||0);
    const payload={
      user_id:user.id, production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, lieu:fLieu.trim()||null, mission_type:fType,
      mission_date:startISO, end_date:endISO!==startISO?endISO:null,
      regime:fRegime,
      hours:hv.hours, vacations:hv.vacations,
      gross_amount:Number(fGross)||0, status:'effectue',
      km_distance:Math.round(kmEff(kmWorkedDays)), km_rate:pf(kmRate),
      km_amount:Math.round(kmFraisFor(kmWorkedDays)*100)/100,
      // Adresses enfin enregistrees (+ coords) : elles alimentent le pop-up des prochaines missions
      // et reapparaissent a l'edition. Avant, seules distance/taux/montant etaient sauvegardes.
      km_from:kmFrom.trim()||null, km_to:kmTo.trim()||null,
      km_from_lat:kmFromCoords?kmFromCoords[1]:null, km_from_lng:kmFromCoords?kmFromCoords[0]:null,
      km_to_lat:kmToCoords?kmToCoords[1]:null, km_to_lng:kmToCoords?kmToCoords[0]:null,
    };
    const { error }= editId
      ? await supabase.from('missions').update(payload).eq('id',editId)
      : await supabase.from('missions').insert(payload);
    setSaving(false);
    if(error){ showAlert('Erreur',error.message); return; }
    setShowForm(false); setEditId(null); loadMissions(true);
  }

  function handleSave(){
    if(!fProduction.trim()){ showAlert('Production manquante','Indique le nom de la production.'); return; }
    if(fMode==='cachet'){
      if(!fCachets.trim()||Number(fCachets)<=0){ showAlert('Cachets manquants','Indique le nombre de cachets.'); return; }
    } else if(!fHours.trim()){ showAlert('Heures manquantes','Indique le nombre d\'heures.'); return; }
    const nb=daysInclusive(fStart,fEnd);
    // Le sélecteur de jours répartit des HEURES par jour : il n'a pas de sens en saisie au cachet.
    if(!editId && nb>=2 && fMode!=='cachet'){
      if(mdpDays.length===0){ openDayPicker(fStart,fEnd); return; }
      commitMultiDay();
    }else{
      saveSimple();
    }
  }

  async function deleteMission(){
    if(!editId)return;
    showAlert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error, count }=await supabase.from('missions').delete({count:'exact'}).eq('id',editId);
        if(error){ showAlert('Erreur',error.message); return; }
        if(count===0){ showAlert('Bloqué','La suppression a été refusée (droits Supabase / RLS).'); return; }
        setShowForm(false); setEditId(null); loadMissions(true);
      }},
    ]);
  }

  // Supprimer une mission directement (croix) sans ouvrir le formulaire.
  function quickDelete(m:any){
    showAlert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error, count }=await supabase.from('missions').delete({count:'exact'}).eq('id',m.id);
        if(error){ showAlert('Erreur',error.message); return; }
        if(count===0){ showAlert('Bloqué','La suppression a été refusée (droits Supabase / RLS).'); return; }
        setDayMenu((dm:any)=>dm?{...dm,missions:dm.missions.filter((x:any)=>x.id!==m.id)}:dm);
        loadMissions(true);
      }},
    ]);
  }

  // Réinitialiser le calendrier : supprime TOUTES les missions (distinct de la remise à zéro des couleurs).
  function resetCalendar(){
    showAlert('Réinitialiser le calendrier ?','Toutes tes missions seront définitivement supprimées pour repartir de zéro. Tes couleurs et notes ne sont pas touchées. Cette action est irréversible.',[
      {text:'Annuler',style:'cancel'},
      {text:'Tout supprimer',style:'destructive',onPress:async()=>{
        const { data:{ user } }=await supabase.auth.getUser();
        if(!user){ showAlert('Erreur','Session expirée, reconnecte-toi.'); return; }
        const { error }=await supabase.from('missions').delete().eq('user_id',user.id);
        if(error){ showAlert('Erreur',error.message); return; }
        loadMissions(true);
      }},
    ]);
  }

  function toggleDay(i:number){ setMdpDays(ds=>ds.map((d,idx)=>idx===i?{...d,checked:!d.checked}:d)); }
  function setDayHours(i:number,h:string){ setMdpDays(ds=>ds.map((d,idx)=>idx===i?{...d,hours:Number(h)||0}:d)); }
  function setAll(val:boolean){ setMdpDays(ds=>ds.map(d=>({...d,checked:val}))); }
  const mdpChecked=mdpDays.filter(d=>d.checked);
  const mdpTotalH=Math.round(mdpChecked.reduce((a,d)=>a+(Number(d.hours)||0),0)*10)/10;

  // Ouvre le sélecteur de jours travaillés (au choix des dates).
  function openDayPicker(s:Date,e:Date){
    const per=8; // chaque jour démarre à 8h (plus de division automatique = plus de virgules)
    const days:{date:string;checked:boolean;hours:number}[]=[];
    for(let d=new Date(s); d<=e; d.setDate(d.getDate()+1)) days.push({date:iso(d),checked:true,hours:per});
    setMdpDays(days); setShowForm(false); setShowMdp(true);
  }
  // « Continuer » : on garde la sélection des jours et on revient au formulaire (pas de sauvegarde ici).
  function confirmDays(){
    if(mdpChecked.length===0){ showAlert('Aucun jour','Coche au moins un jour travaillé.'); return; }
    setFHours(String(mdpTotalH));
    setFVacations(String(mdpChecked.length));
    setShowMdp(false); setShowForm(true);
  }
  async function commitMultiDay(){
    if(mdpChecked.length===0){ showAlert('Aucun jour','Coche au moins un jour travaillé.'); return; }
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user){ showAlert('Erreur','Tu n\'es plus connecté.'); setSaving(false); return; }
    const totalGross=Number(fGross)||0;
    const sumHours=mdpChecked.reduce((a,d)=>a+(Number(d.hours)||0),0);
    const runs:{start:string;end:string;hours:number;days:number}[]=[];
    let cur:any=null;
    for(const d of mdpDays){
      if(!d.checked){ cur=null; continue; }
      if(cur && d.hours===cur.hours && isNextDay(cur.end,d.date)){ cur.end=d.date; cur.days++; }
      else { cur={start:d.date,end:d.date,hours:d.hours,days:1}; runs.push(cur); }
    }
    const payloads=runs.map((r)=>{
      const runHours=r.hours*r.days;
      const gross=sumHours>0?Math.round(totalGross*(runHours/sumHours)):Math.round(totalGross/runs.length);
      return { user_id:user.id, production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, lieu:fLieu.trim()||null, mission_type:fType,
        regime:fRegime,
        mission_date:r.start, end_date:r.end!==r.start?r.end:null,
        hours:runHours, vacations:r.days, gross_amount:gross, status:'effectue',
        km_distance:0, km_rate:0, km_amount:0 };
    });
    const grossSum=payloads.reduce((a,p)=>a+p.gross_amount,0);
    if(payloads.length)payloads[0].gross_amount+=(totalGross-grossSum);
    // Frais km : appliqués une seule fois sur la 1re ligne (total sur la période)
    if(payloads.length){
      const nbDays=mdpChecked.length;
      payloads[0].km_distance=Math.round(kmEff(nbDays));
      payloads[0].km_rate=pf(kmRate);
      payloads[0].km_amount=Math.round(kmFraisFor(nbDays)*100)/100;
    }
    const { error }=await supabase.from('missions').insert(payloads);
    setSaving(false);
    if(error){ showAlert('Erreur',error.message); return; }
    setShowMdp(false); setShowForm(false); setEditId(null); setMdpDays([]); loadMissions(true);
  }

  const year=current.getFullYear(), month=current.getMonth();
  const firstDay=new Date(year,month,1);
  const startWeekday=(firstDay.getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const todayISO=iso(new Date());
  const cells:(Date|null)[]=[];
  for(let i=0;i<startWeekday;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(new Date(year,month,d));
  while(cells.length%7!==0)cells.push(null);

  function missionsOn(d:Date){const day=iso(d);return missions.filter((m:any)=>{const s=m.mission_date;const e=m.end_date||m.mission_date;return day>=s&&day<=e;});}

  const monthMissions=missions.filter((m:any)=>{const d=new Date(m.mission_date+'T00:00:00');return d.getMonth()===month&&d.getFullYear()===year;});
  const perPage=4;
  const totalPages=Math.max(1,Math.ceil(monthMissions.length/perPage));
  const visible=monthMissions.slice(page*perPage,(page+1)*perPage);
  const monthNotes=notes.filter((n)=>{const d=new Date(n.date+'T00:00:00');return d.getMonth()===month&&d.getFullYear()===year;}).sort((a,b)=>a.date<b.date?-1:1);

  const allProds=Array.from(new Set(missions.map((m:any)=>(m.production||'').toUpperCase().trim()).filter(Boolean))).sort();

  function moveMonth(n:number){const d=new Date(current);d.setMonth(d.getMonth()+n);d.setDate(1);setCurrent(d);setPage(0);}
  function _showExcelInfo(){
    showAlert('Format Excel / CSV',
      "Une ligne par mission. Intermitrack lit ces colonnes (peu importe l'ordre) :\n\n• Date — ex. 05/07/2026\n• Production — l'employeur\n• Heures — ex. 8\n• Montant / Brut — ex. 230\n\nExemple :\nDate | Production | Heures | Montant\n05/07/2026 | ENDEMOL | 8 | 230\n\nUne colonne manque ? Pas grave, tu completeras apres l'import.",
      [{text:'Compris'}]);
  }
  function _showCalInfo(){
    showAlert('Format agenda / calendrier',
      "Intermitrack lit les evenements de ton agenda (iPhone / Samsung). Pour qu'il recupere tout, ecris dans le TITRE de l'evenement :\n\nProduction   Heures   Prix\nEx : ENDEMOL 8h 350€\n\nL'ordre est libre (ENDEMOL 350€ 8h marche aussi). La date vient de l'evenement.\n\nPas d'heures indiquees ? On met 8h par defaut pour le jour (modifiable apres l'import). Il manque une autre info ? Tu completeras apres.",
      [{text:'Compris'}]);
  }

  function onCellPress(d:Date){
    setDayMenu({date:d,missions:missionsOn(d)});
  }
  // Suggestions de production : on prend les productions déjà saisies (dans `missions`),
  // sans doublons, insensible à la casse, et on garde celles qui contiennent le texte tapé.
  const prodQuery=fProduction.trim().toUpperCase();
  // Employeurs deja saisis, classes du PLUS FREQUENT au moins frequent : les recurrents remontent d'eux-memes.
  const prodCounts=missions.reduce((acc:Record<string,number>,m:any)=>{const p=(m.production||'').toUpperCase().trim();if(p)acc[p]=(acc[p]||0)+1;return acc;},{});
  const knownProductions=Object.keys(prodCounts).sort((a,b)=>prodCounts[b]-prodCounts[a]);

  // Suggestions d'émission : on propose d'abord les émissions déjà utilisées pour la
  // production choisie, puis les autres. Insensible à la casse, casse d'origine conservée.
  const emQuery=fEmission.trim().toLowerCase();
  const emForProd=missions.filter((m:any)=>(m.production||'').toUpperCase().trim()===prodQuery).map((m:any)=>(m.emission||'').trim()).filter(Boolean);
  const emAll=missions.map((m:any)=>(m.emission||'').trim()).filter(Boolean);
  const emUnique=(list:string[])=>{const seen=new Set<string>();const out:string[]=[];for(const e of list){const k=e.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(e);}}return out;};
  const emSuggestions=(emQuery
    ? emUnique([...emForProd,...emAll]).filter(e=>e.toLowerCase().includes(emQuery)&&e.toLowerCase()!==emQuery)
    : emUnique(emForProd)
  ).slice(0,5);
  const lieuQuery=fLieu.trim().toLowerCase();
  const knownLieux=Array.from(new Set(missions.map((m:any)=>(m.lieu||'').trim()).filter(Boolean)));
  const lieuSuggestions=(lieuQuery?knownLieux.filter(l=>l.toLowerCase().includes(lieuQuery)&&l.toLowerCase()!==lieuQuery):knownLieux).slice(0,5);

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.headerBar}><Text style={s.headerTitle}>{monthLabel(current)}</Text></View>

      <View style={s.nav}>
        <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(-1)}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
        <TouchableOpacity onPress={()=>{setPickerYear(current.getFullYear());setShowMonthPicker(true);}} activeOpacity={0.7} style={[s.navLabel,{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}]}>
          <Text style={{fontSize:16,fontWeight:'900',color:C.petrol}}>{monthLabel(current)}</Text>
          <Ionicons name="chevron-down" size={15} color={C.petrol}/>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(1)}><Text style={s.navTxt}>›</Text></TouchableOpacity>
      </View>

      <Text style={{fontSize:12.5,fontWeight:'700',color:C.muted,marginHorizontal:16,marginTop:2,marginBottom:6}}>Importer mes missions</Text>
      <View style={{flexDirection:'row',gap:8,marginHorizontal:14,marginBottom:10}}>
        <View style={{flex:1}}>
          <TouchableOpacity onPress={_showCalInfo} hitSlop={6} style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,marginBottom:5}}>
            <Ionicons name="information-circle-outline" size={14} color={C.petrol}/>
            <Text style={{fontSize:11.5,fontWeight:'800',color:C.petrol}}>Format agenda</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>{setImportMode('calendar');setShowImport(true);}} activeOpacity={0.85} style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:12,borderRadius:12,borderWidth:1.5,borderColor:C.petrol,backgroundColor:C.soft}}>
            <Ionicons name="calendar-outline" size={17} color={C.petrol}/>
            <Text style={{color:C.petrol,fontWeight:'800',fontSize:12.5}}>Calendrier</Text>
          </TouchableOpacity>
        </View>
        <View style={{flex:1}}>
          <TouchableOpacity onPress={_showExcelInfo} hitSlop={6} style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,marginBottom:5}}>
            <Ionicons name="information-circle-outline" size={14} color={C.petrol}/>
            <Text style={{fontSize:11.5,fontWeight:'800',color:C.petrol}}>Format Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>{setImportMode('excel');setShowImport(true);}} activeOpacity={0.85} style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:12,borderRadius:12,borderWidth:1.5,borderColor:C.petrol,backgroundColor:C.soft}}>
            <Ionicons name="document-text-outline" size={17} color={C.petrol}/>
            <Text style={{color:C.petrol,fontWeight:'800',fontSize:12.5}}>Excel / CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      <CalendarImportModal visible={showImport} mode={importMode} onClose={()=>setShowImport(false)} onImported={()=>loadMissions()}/>

      <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={()=>setShowMonthPicker(false)}>
        <TouchableOpacity activeOpacity={1} onPress={()=>setShowMonthPicker(false)} style={{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'center',alignItems:'center',padding:24}}>
          <TouchableOpacity activeOpacity={1} onPress={()=>{}} style={{backgroundColor:C.card,borderRadius:20,padding:18,width:'100%',maxWidth:360}}>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <TouchableOpacity onPress={()=>setPickerYear(pickerYear-1)} hitSlop={10} style={{padding:6}}><Ionicons name="chevron-back" size={22} color={C.petrol}/></TouchableOpacity>
              <Text style={{fontSize:18,fontWeight:'900',color:C.text}}>{pickerYear}</Text>
              <TouchableOpacity onPress={()=>setPickerYear(pickerYear+1)} hitSlop={10} style={{padding:6}}><Ionicons name="chevron-forward" size={22} color={C.petrol}/></TouchableOpacity>
            </View>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'space-between'}}>
              {MONTHS_FR.map((mName,mi)=>{
                const isCur = mi===current.getMonth() && pickerYear===current.getFullYear();
                return (
                  <TouchableOpacity key={mi} onPress={()=>{setCurrent(new Date(pickerYear,mi,1));setPage(0);setShowMonthPicker(false);}}
                    style={{width:'31%',paddingVertical:12,borderRadius:11,alignItems:'center',backgroundColor:isCur?C.petrol:C.soft}}>
                    <Text style={{fontSize:13,fontWeight:'800',color:isCur?'#fff':C.text}}>{mName}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <View style={s.colorTools}>
        <TouchableOpacity style={s.colorToolBtn} onPress={()=>setManagerOpen(true)}>
          <Ionicons name="brush-outline" size={15} color={C.petrol}/>
          <Text style={s.colorToolTxt}>Personnaliser les couleurs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.colorToolBtn} onPress={()=>{
          showAlert('Réinitialiser les couleurs ?','Toutes les productions reviennent aux couleurs par défaut. Aucune mission n\'est supprimée.',[
            {text:'Annuler',style:'cancel'},
            {text:'Réinitialiser',style:'destructive',onPress:()=>reset()},
          ]);
        }}>
          <Ionicons name="refresh-outline" size={15} color={C.petrol}/>
          <Text style={s.colorToolTxt}>Réinitialiser les couleurs</Text>
        </TouchableOpacity>
      </View>

      <View style={s.weekRow}>
        {['L','M','M','J','V','S','D'].map((d,i)=>(<Text key={i} style={s.weekDay}>{d}</Text>))}
      </View>

      <View style={s.grid}>
        {cells.map((d,i)=>{
          if(!d)return<View key={i} style={[s.cell,{backgroundColor:'transparent',borderColor:'transparent',elevation:0,shadowOpacity:0}]}/>;
          const dayISO=iso(d);
          const ms=missionsOn(d);
          const has=ms.length>0;
          const isToday=dayISO===todayISO;
          const isPast=dayISO<todayISO;
          const first=ms[0];
          const dayNotes=notesForDate(dayISO);
          const noteOnly=!has&&dayNotes.length>0;
          const note0=dayNotes[0];
          const noteMark=has&&dayNotes.length>0;
          const customCol=has?(first?getColor(first.production):null):(noteOnly?(note0.color||'#1E6FE0'):null);
          const fillable=has||noteOnly;
          // 2 missions le même jour → case coupée en diagonale (moitié/moitié), comme sur le site.
          const isSplit=has&&ms.length===2&&!isToday;
          const cA=isSplit?(getColor(ms[0].production)||(isPast?'#1F4E5F':'#F97316')):'';
          const cB=isSplit?(getColor(ms[1].production)||(isPast?'#1F4E5F':'#F97316')):'';
          const grad=(!isToday&&fillable&&!isSplit)?(customCol?prodGradient(customCol):(isPast?GRAD_PAST_T:GRAD_FUTURE_T)):null;
          const filled=grad!=null||isSplit;
          const hach=filled&&!isSplit&&(noteOnly||(isPast&&!!customCol)); // notes hachurées ; missions passées perso hachurées
          const baseTxt=isSplit?textOn(cA):(customCol?textOn(customCol):'#fff');
          const txtColor=isToday?C.petrol:(filled?baseTxt:C.text);
          const subColor=isToday?C.muted:(filled?(customCol?baseTxt:'rgba(255,255,255,.85)'):C.muted);
          return(
            <TouchableOpacity key={i} style={[s.cell,isToday?s.cellToday:(filled?s.cellFilled:s.cellEmpty)]} activeOpacity={0.85} onPress={()=>onCellPress(d)}>
              {isSplit
                ? <LinearGradient colors={[cA,cA,'rgba(255,255,255,0.6)','rgba(255,255,255,0.6)',cB,cB]} locations={[0,0.49,0.49,0.51,0.51,1]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
                : (grad&&<LinearGradient colors={grad} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>)}
              {hach&&<Svg width={84} height={80} style={{position:'absolute',top:0,left:0}}>{Array.from({length:22},(_,k)=>{const o=-84+k*9;return <Line key={k} x1={o} y1={0} x2={o+84} y2={84} stroke="rgba(255,255,255,0.30)" strokeWidth={2.5}/>;})}</Svg>}
              {isToday&&<Animated.View pointerEvents="none" style={[s.todayFrame,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[0.35,1]})}]}/>}
              {noteMark&&<View pointerEvents="none" style={{position:'absolute',top:4,right:4,width:8,height:8,borderRadius:3,backgroundColor:(note0&&note0.color)||'#1E6FE0',zIndex:3}}/>}
              <Text style={[s.cellDay,{color:txtColor},isToday&&s.cellDayToday]}>{d.getDate()}</Text>
              {isSplit?(
                <>
                  <Text style={[s.cellProd,{color:txtColor}]} numberOfLines={1}>{(ms[0].production||'').slice(0,3).toUpperCase()}</Text>
                  <Text style={[s.cellProd,{color:textOn(cB),position:'absolute',right:5,bottom:4,marginTop:0,textAlign:'right'}]} numberOfLines={1}>{(ms[1].production||'').slice(0,3).toUpperCase()}</Text>
                </>
              ):first&&(
                <>
                  <Text style={[s.cellProd,{color:txtColor}]} numberOfLines={1}>
                    {(first.production||'').slice(0,3).toUpperCase()}
                  </Text>
                  <Text style={[s.cellInfo,{color:subColor}]} numberOfLines={1}>
                    {Math.round((Number(first.hours||0)/daysInclusive(new Date((first.mission_date)+'T00:00:00'),new Date((first.end_date||first.mission_date)+'T00:00:00')))*10)/10}h{ms.length>1?` · +${ms.length-1}`:''}
                  </Text>
                </>
              )}
              {noteOnly&&(
                <Text style={[s.cellProd,{color:txtColor}]} numberOfLines={1}>{noteAbbr(note0.title)}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.hint}>Touche un jour pour ajouter une mission, ou une mission existante pour la modifier</Text>
      <TouchableOpacity onPress={resetCalendar} hitSlop={8} style={{alignSelf:'center',marginTop:1,marginBottom:2,paddingVertical:5,paddingHorizontal:10}}>
        <Text style={{fontSize:11.5,color:C.muted,textDecorationLine:'underline'}}>Réinitialiser le calendrier</Text>
      </TouchableOpacity>

      <View style={s.calTabs}>
        <TouchableOpacity style={[s.calTab,calTab==='missions'&&s.calTabOn]} onPress={()=>setCalTab('missions')}>
          <Text style={calTab==='missions'?s.calTabTxtOn:s.calTabTxt}>Mes missions du mois</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.calTab,calTab==='notes'&&s.calTabOn]} onPress={()=>setCalTab('notes')}>
          <Text style={calTab==='notes'?s.calTabTxtOn:s.calTabTxt}>Notes perso</Text>
        </TouchableOpacity>
      </View>

      {calTab==='missions' ? (
      <View style={{paddingHorizontal:16,gap:10}}>
        {monthMissions.length===0
          ?<Text style={s.empty}>Aucune mission ce mois-ci.</Text>
          :visible.map((m:any)=>{
            const col=getColor(m.production)||C.petrol;
            return(
              <TouchableOpacity key={m.id} style={[s.missionCard,{borderLeftColor:col}]} onPress={()=>openEdit(m)}>
                <View style={{flex:1,gap:3}}>
                  <View style={s.mRow}><Ionicons name="document-text-outline" size={13} color={col}/><Text style={[s.mProd,{color:col}]} numberOfLines={1}>{m.production}</Text></View>
                  {m.emission?<View style={s.mRow}><Ionicons name="videocam-outline" size={12} color={C.muted}/><Text style={s.mEmission} numberOfLines={1}>{m.emission}</Text></View>:null}
                  {m.lieu?<View style={s.mRow}><Ionicons name="location-outline" size={12} color={C.muted}/><Text style={s.mDate} numberOfLines={1}>{m.lieu}</Text></View>:null}
                  <View style={s.mRow}><Ionicons name="calendar-outline" size={12} color={C.muted}/><Text style={s.mDate}>{fmtDate(m.mission_date)}</Text></View>
                </View>
                <View style={{alignItems:'flex-end',gap:6}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:4}}><Ionicons name="time-outline" size={14} color={col}/><Text style={[s.mHours,{color:col}]}>{m.hours}h</Text></View>
                  <View style={s.mPill}><Text style={s.mPillTxt}>{m.mission_type}</Text></View>
                </View>
                <TouchableOpacity style={[s.quickDelBtn,{alignSelf:'center'}]} onPress={()=>quickDelete(m)} hitSlop={6}>
                  <Ionicons name="close" size={17} color={C.danger}/>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        }
        {totalPages>1&&(
          <View style={s.pager}>
            <TouchableOpacity style={[s.navBtn,{opacity:page===0?0.3:1}]} disabled={page===0} onPress={()=>setPage(p=>Math.max(0,p-1))}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
            <Text style={s.pagerTxt}>Page {page+1} / {totalPages}</Text>
            <TouchableOpacity style={[s.navBtn,{opacity:page>=totalPages-1?0.3:1}]} disabled={page>=totalPages-1} onPress={()=>setPage(p=>Math.min(totalPages-1,p+1))}><Text style={s.navTxt}>›</Text></TouchableOpacity>
          </View>
        )}
      </View>
      ) : (
      <View style={{paddingHorizontal:16,gap:10}}>
        {monthNotes.length===0
          ?<Text style={s.empty}>Aucune note ce mois-ci.</Text>
          :monthNotes.map((n)=>(
            <TouchableOpacity key={n.id} style={[s.missionCard,{borderLeftColor:n.color||'#1E6FE0'}]} onPress={()=>setNoteDetail(n)}>
              <View style={{flex:1}}>
                <Text style={[s.mProd,{color:n.color||C.petrol}]}>{n.title||'Note'}</Text>
                {n.text?<Text style={s.mEmission} numberOfLines={1}>{n.text}</Text>:null}
                <Text style={s.mDate}>{fmtDate(n.date)}{n.endDate&&n.endDate!==n.date?` → ${fmtDate(n.endDate)}`:''}</Text>
              </View>
              <Text style={s.dayMenuChevron}>›</Text>
            </TouchableOpacity>
          ))
        }
      </View>
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={()=>setShowForm(false)}>
        {/* iOS : le ScrollView ci-dessous utilise automaticallyAdjustKeyboardInsets, qui remonte DEJA le contenu
            et fait defiler jusqu'au champ vise. Y ajouter un behavior="padding" fait compenser le clavier DEUX fois
            → le champ saute / part de travers (ex. « ajouter un poste »). On laisse donc iOS au ScrollView seul.
            Android ignore automaticallyAdjustKeyboardInsets : lui garde behavior="height". */}
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?undefined:'height'}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle,{marginBottom:0,flex:1,textAlign:'left'}]}>
                {fRegime==='intermittence' ? (editId?'Modifier la mission':'Ajouter une mission')
                                          : (editId?'Modifier l\'activité':'Activité régime général')}
              </Text>
              <TouchableOpacity style={s.modalClose} onPress={()=>{setShowForm(false);setEditId(null);}} hitSlop={8}>
                <Ionicons name="close" size={22} color={C.muted}/>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

              {fRegime!=='intermittence'&&(
                <View style={s.rgBox}>
                  <Text style={s.rgTitle}>De quoi s'agit-il ?</Text>
                  <Text style={s.rgLead}>Les deux ne comptent pas pareil dans tes 507 h. Choisis ton cas :</Text>

                  <TouchableOpacity style={[s.rgOpt,fRegime==='general'&&s.rgOptOn]} activeOpacity={0.85}
                    onPress={()=>setFRegime('general')}>
                    <View style={s.rgOptHead}>
                      <View style={[s.rgRadio,fRegime==='general'&&s.rgRadioOn]}>
                        {fRegime==='general'?<View style={s.rgRadioDot}/>:null}
                      </View>
                      <Text style={s.rgOptTitle}>Un travail hors spectacle</Text>
                    </View>
                    <Text style={s.rgOptEx}>Pub en tant que mannequin, restauration, bureau, vente… Tout emploi salarié qui ne relève pas des annexes 8 ou 10.</Text>
                    <Text style={[s.rgOptTag,{color:C.warnTx,backgroundColor:C.warnBg}]}>Ne compte PAS dans les 507 h</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.rgOpt,fRegime==='enseignement'&&s.rgOptOn]} activeOpacity={0.85}
                    onPress={()=>setFRegime('enseignement')}>
                    <View style={s.rgOptHead}>
                      <View style={[s.rgRadio,fRegime==='enseignement'&&s.rgRadioOn]}>
                        {fRegime==='enseignement'?<View style={s.rgRadioDot}/>:null}
                      </View>
                      <Text style={s.rgOptTitle}>De l'enseignement</Text>
                    </View>
                    <Text style={s.rgOptEx}>Tu donnes des cours (chant, technique, danse…) dans un établissement <Text style={{fontWeight:'800'}}>agréé</Text>, sur une matière <Text style={{fontWeight:'800'}}>en lien avec ton métier</Text>, avec un vrai contrat de travail. Les 3 conditions sont obligatoires.</Text>
                    <Text style={[s.rgOptTag,{color:C.green,backgroundColor:C.greenBg}]}>COMPTE dans les 507 h</Text>
                  </TouchableOpacity>

                  <Text style={s.rgInfo}>
                    {fRegime==='enseignement'
                      ? "Plafond : 70 h — ou 120 h si tu as 50 ans ou plus à la fin du contrat. L'appli retient jusqu'à 120 h pour ne léser personne : ne saisis que les heures qui te concernent vraiment. Ce plafond est partagé avec tes heures de formation (338 h au total)."
                      : "Ces heures entrent quand même dans l'estimation France Travail du mois : toute heure travaillée, quel que soit le régime, réduit tes jours indemnisables. C'est pour ça qu'il vaut le coup de les saisir."}
                  </Text>
                </View>
              )}

              {/* Un appui sur le champ ouvre le POP-UP listant toutes les productions, de la plus utilisee a la
                  moins utilisee : on choisit directement, ou on en cree une nouvelle. Retour Damien. */}
              <Text style={s.label}>{fRegime==='intermittence'?'Nom de la production':'Nom de l\'employeur'}</Text>
              <TouchableOpacity style={s.typeBtn} onPress={()=>setShowProdPicker(true)}>
                <Text style={[s.typeBtnTxt,!fProduction&&{color:C.muted,fontWeight:'400'}]} numberOfLines={1}>{fProduction||'Choisir ou créer…'}</Text>
                <Text style={s.typeBtnChevron}>▾</Text>
              </TouchableOpacity>
              <ProductionPickerModal
                visible={showProdPicker}
                productions={knownProductions}
                current={fProduction}
                label={fRegime==='intermittence'?'Production':'Employeur'}
                onPick={(p)=>{setFProduction(p);setShowProdPicker(false);}}
                onClose={()=>setShowProdPicker(false)}
              />

              {fProduction.trim().length>0 && (
                <>
                  <Text style={s.label}>Couleur de la production</Text>
                  <View style={s.colorRow}>
                    <TouchableOpacity style={[s.colorSw,getColor(fProduction)===null&&s.colorSwOn]} onPress={()=>setColor(fProduction,null)}>
                      <LinearGradient colors={['#1F4E5F','#1F4E5F','#F97316','#F97316']} locations={[0,0.5,0.5,1]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
                      <Text style={{fontSize:8,fontWeight:'900',color:'#fff'}}>auto</Text>
                    </TouchableOpacity>
                    {PROD_PRESETS.concat(custom).map(hex=>(
                      <TouchableOpacity key={hex} style={[s.colorSw,{backgroundColor:hex},(getColor(fProduction)||'').toLowerCase()===hex.toLowerCase()&&s.colorSwOn]} onPress={()=>setColor(fProduction,hex)} />
                    ))}
                    <TouchableOpacity style={s.colorAdd} onPress={()=>setColorPickerOpen(true)}><Text style={s.colorAddTxt}>+</Text></TouchableOpacity>
                  </View>
                  {!!getColor(fProduction)&&<Text style={[s.miniHint,{marginTop:6}]}>Mémorisée et appliquée partout (calendrier, missions, graphique).</Text>}
                  <ColorPickerModal visible={colorPickerOpen} initial={getColor(fProduction)||'#1E6FE0'} onClose={()=>setColorPickerOpen(false)} onPick={(hex)=>{ addCustom(hex); setColor(fProduction,hex); setColorPickerOpen(false); }} />
                </>
              )}

              <Text style={s.label}>Nom de l'émission (facultatif)</Text>
              <TxtInput style={s.input} value={fEmission} onChangeText={(t:string)=>{setFEmission(t);setShowEmSuggest(true);}} onFocus={()=>setShowEmSuggest(true)} placeholder="Ex : Koh-Lanta" placeholderTextColor={C.muted}/>
              {showEmSuggest&&emSuggestions.length>0&&(
                <View style={s.suggestBox}>
                  {emSuggestions.map(e=>(
                    <TouchableOpacity key={e} style={s.suggestItem} onPress={()=>{setFEmission(e);setShowEmSuggest(false);}}>
                      <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="videocam-outline" size={13} color={C.petrol} /><Text style={s.suggestTxt}>{e}</Text></View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={s.label}>Lieu (facultatif)</Text>
              <TxtInput style={s.input} value={fLieu} onChangeText={(t:string)=>{setFLieu(t);setShowLieuSuggest(true);}} onFocus={()=>setShowLieuSuggest(true)} placeholder="Ex : Studio 130…" placeholderTextColor={C.muted}/>
              {showLieuSuggest&&lieuSuggestions.length>0&&(
                <View style={s.suggestBox}>
                  {lieuSuggestions.map(l=>(
                    <TouchableOpacity key={l} style={s.suggestItem} onPress={()=>{setFLieu(l);setShowLieuSuggest(false);}}>
                      <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="location-outline" size={13} color={C.petrol} /><Text style={s.suggestTxt}>{l}</Text></View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={s.label}>Type de mission</Text>
              <TouchableOpacity style={s.typeBtn} onPress={()=>{setTypeAddMode(false);setShowTypePicker(v=>!v);}}>
                <Text style={s.typeBtnTxt}>{fType}</Text>
                <Text style={s.typeBtnChevron}>{showTypePicker?'▴':'▾'}</Text>
              </TouchableOpacity>
              {/* Plusieurs types le meme jour pour le meme employeur (ex. « Rec + MIX » en doublage) : on garde
                  l'appui UNIQUE pour le cas courant, et on ajoute un lien discret pour en cumuler un 2e.
                  Retour Damien. */}
              {typeParts(fType).length>1 && (
                <View style={s.typeWrap}>
                  {typeParts(fType).map(t=>(
                    <View key={t} style={[s.typeChip,s.typeChipActive,{flexDirection:'row',alignItems:'center',gap:6}]}>
                      <Text style={s.typeChipTxtActive}>{t}</Text>
                      <TouchableOpacity onPress={()=>setFType(removeType(fType,t))} hitSlop={8}><Text style={{color:'#fff',fontWeight:'900',fontSize:13}}>×</Text></TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {!showTypePicker && !!fType && (
                <TouchableOpacity onPress={()=>{setTypeAddMode(true);setShowTypePicker(true);}}>
                  <Text style={s.typeAddLink}>+ 2e type de mission (ex. Son + Light)</Text>
                </TouchableOpacity>
              )}
              {showTypePicker && (
                <View style={s.typePickerInline}>
                  {/* Annuler : sans ca, un appui par erreur sur « + Ajouter un type » obligeait a choisir
                      quelque chose (ou a quitter la mission). Retour Yohan. */}
                  {typeAddMode && (
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}>
                      <Text style={[s.typeGroupLbl,{flexShrink:1}]} numberOfLines={1}>Ajouter un 2e type à « {fType} »</Text>
                      <TouchableOpacity onPress={()=>{setShowTypePicker(false);setTypeAddMode(false);}} hitSlop={8}>
                        <Text style={s.typeCancelTxt}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={s.typeWrap}>
                    {['Montage','Tournage','Démontage'].map(p=>(
                      <TouchableOpacity key={p} style={[s.typeChip,typeParts(fType).includes(p)&&s.typeChipActive]} onPress={()=>{setFType(typeAddMode?addType(fType,p):p);setShowTypePicker(false);setTypeAddMode(false);}}>
                        <Text style={typeParts(fType).includes(p)?s.typeChipTxtActive:s.typeChipTxt}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {postes.length>0 && (
                    <View>
                      <Text style={s.typeGroupLbl}>Mes postes</Text>
                      <View style={s.typeWrap}>
                        {postes.map(p=>(
                          <View key={p} style={[s.typeChip,typeParts(fType).includes(p)&&s.typeChipActive,{flexDirection:'row',alignItems:'center',gap:6}]}>
                            <TouchableOpacity onPress={()=>{setFType(typeAddMode?addType(fType,p):p);setShowTypePicker(false);setTypeAddMode(false);}}><Text style={typeParts(fType).includes(p)?s.typeChipTxtActive:s.typeChipTxt}>{p}</Text></TouchableOpacity>
                            <TouchableOpacity onPress={()=>removePoste(p)} hitSlop={8}><Text style={{color:typeParts(fType).includes(p)?'#fff':C.muted,fontWeight:'900',fontSize:13}}>×</Text></TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={s.typeGroupLbl}>Ajouter un poste</Text>
                  <View style={{flexDirection:'row',gap:8}}>
                    <TxtInput style={[s.input,{flex:1}]} value={newPoste} onChangeText={setNewPoste} placeholder="Ex : Clown, Cascadeur…" placeholderTextColor={C.muted}/>
                    <TouchableOpacity style={s.addPosteBtn} onPress={()=>{const v=newPoste.trim();if(v){addPoste(v);setFType(typeAddMode?addType(fType,v):v);setNewPoste('');setShowTypePicker(false);setTypeAddMode(false);}}}><Text style={s.addPosteTxt}>Ajouter</Text></TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={s.row}>
                <View style={{flex:1}}>
                  <Text style={s.label}>Date début</Text>
                  <TouchableOpacity style={s.input} onPress={()=>setShowStartPicker(true)}>
                    <Text style={s.inputTxt}>{fStart.toLocaleDateString('fr-FR')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{flex:1}}>
                  <Text style={s.label}>Date fin</Text>
                  <TouchableOpacity style={s.input} onPress={()=>setShowEndPicker(true)}>
                    <Text style={s.inputTxt}>{fEnd.toLocaleDateString('fr-FR')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {showStartPicker&&(
                <DateTimePicker value={fStart} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowStartPicker(false);if(date){setFStart(date);if(date>fEnd)setFEnd(date);}}}/>
              )}
              {showEndPicker&&(
                <DateTimePicker value={fEnd} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowEndPicker(false);if(date){setFEnd(date); if(!editId && fMode!=='cachet' && mdpDays.length===0 && daysInclusive(fStart,date)>=2){ openDayPicker(fStart,date); }}}}/>
              )}

              {/* « Les deux » : c'est l'utilisateur qui dit, mission par mission, s'il saisit en heures ou en cachets.
                  En technicien / artiste, le mode est imposé par l'annexe et ce sélecteur reste caché. */}
              {annexe==='les_deux' && (
                <View style={{flexDirection:'row',gap:8,marginTop:4,marginBottom:4}}>
                  {([['heures','Heures'],['cachet','Cachets']] as ['heures'|'cachet',string][]).map(([val,lbl])=>(
                    <TouchableOpacity key={val} style={[s.mmOpt, fMode===val&&{backgroundColor:C.petrol,borderColor:C.petrol}]} onPress={()=>setFMode(val)}>
                      <Text style={[s.mmOptTxt, fMode===val&&{color:'#fff'}]}>{lbl}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {fMode==='cachet' && (
                <>
                  <Text style={s.label}>Nombre de cachets</Text>
                  <NumInput style={s.input} value={fCachets} onChangeText={setFCachets} placeholder="Ex : 2" placeholderTextColor={C.muted}/>
                  <Text style={s.miniHint}>1 cachet = {CACHET_H} h pour le comptage des 507 h. Indique le nombre de cachets tel qu'il figure sur ton AEM.</Text>
                </>
              )}

              <Text style={s.label}>{fMode==='cachet'?'Heures payées en heures (facultatif)':'Heures cumulées'}</Text>
              <NumInput style={s.input} value={fHours} onChangeText={setFHours} placeholder={fMode==='cachet'?'0':'8'} placeholderTextColor={C.muted}/>
              {fMode==='cachet' && <Text style={s.miniHint}>Répétitions, ateliers… payés en heures et non en cachets, sur ce même contrat. Elles s'ajoutent aux cachets.</Text>}
              {fMode!=='cachet' && (
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8}}>
                {[4,8,12].map(h=>(
                  <TouchableOpacity key={h} style={[s.mdpTool, fHours===String(h)&&{backgroundColor:C.petrol}]} onPressIn={()=>setFHours(String(h))}>
                    <Text style={[s.mdpToolTxt, fHours===String(h)&&{color:'#fff'}]}>{h}h</Text>
                  </TouchableOpacity>
                ))}
              </View>
              )}
              {(!editId && fMode!=='cachet' && daysInclusive(fStart,fEnd)>=2) ? (
                <TouchableOpacity style={s.kmCalcBtn} onPress={()=>openDayPicker(fStart,fEnd)}>
                  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Ionicons name="calendar-outline" size={14} color={C.petrol} /><Text style={s.kmCalcTxt}>{mdpChecked.length>0?`${mdpChecked.length} jour(s) travaillé(s) · modifier`:'Choisir les jours travaillés'}</Text></View>
                </TouchableOpacity>
              ) : null}

              {/* En cachet, le nombre de vacations EST le nombre de cachets : on ne le redemande pas. */}
              {fMode!=='cachet' && (<>
              <Text style={s.label}>Nombre de vacations</Text>
              <NumInput style={s.input} value={fVacations} onChangeText={setFVacations} placeholder="Ex : 1" placeholderTextColor={C.muted}/>
              <Text style={s.miniHint}>1 vacation = 1 journée de travail. Se remplit tout seul depuis le sélecteur de jours.</Text>
              </>)}

              <Text style={s.label}>Montant brut (€)</Text>
              <NumInput style={s.input} value={fGross} onChangeText={setFGross} placeholder="0" placeholderTextColor={C.muted}/>

              <TouchableOpacity style={s.kmHead} onPress={()=>setKmOpen(o=>!o)}>
                <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="car-outline" size={14} color={C.petrol} /><Text style={s.kmHeadTxt}>Frais kilométriques (optionnel)</Text></View>
                <Text style={s.kmChevron}>{kmOpen?'▲':'▼'}</Text>
              </TouchableOpacity>
              {kmOpen&&(
                <View style={s.kmBody}>
                  <Text style={s.label}>Lieu de départ</Text>
                  {/* Un appui ouvre le pop-up des adresses deja saisies, de la plus utilisee a la moins
                      utilisee : le domicile remonte tout seul en tete. Retours JB et second utilisateur. */}
                  <TouchableOpacity style={s.typeBtn} onPress={()=>setShowFromPicker(true)}>
                    <Text style={[s.typeBtnTxt,!kmFrom&&{color:C.muted,fontWeight:'400'}]} numberOfLines={1}>{kmFrom||'Choisir ou saisir…'}</Text>
                    <Text style={s.typeBtnChevron}>▾</Text>
                  </TouchableOpacity>
                  <AddressPickerModal
                    visible={showFromPicker}
                    addresses={knownFrom(missions)}
                    current={kmFrom}
                    title="Lieu de départ"
                    onPick={(l,c)=>{setKmFrom(l);setKmFromCoords(c);setShowFromPicker(false);}}
                    onClose={()=>setShowFromPicker(false)}
                  />
                  <Text style={s.label}>Lieu d'arrivée</Text>
                  {/* L'arrivee propose aussi les LIEUX de mission deja saisis : ce champ etait deja
                      enregistre, la liste est donc utile des la premiere ouverture. */}
                  <TouchableOpacity style={s.typeBtn} onPress={()=>setShowToPicker(true)}>
                    <Text style={[s.typeBtnTxt,!kmTo&&{color:C.muted,fontWeight:'400'}]} numberOfLines={1}>{kmTo||'Choisir ou saisir…'}</Text>
                    <Text style={s.typeBtnChevron}>▾</Text>
                  </TouchableOpacity>
                  <AddressPickerModal
                    visible={showToPicker}
                    addresses={knownTo(missions)}
                    current={kmTo}
                    title="Lieu d'arrivée"
                    onPick={(l,c)=>{setKmTo(l);setKmToCoords(c);setShowToPicker(false);}}
                    onClose={()=>setShowToPicker(false)}
                  />
                  <TouchableOpacity style={s.kmCheck} onPress={()=>setKmRT(v=>!v)}>
                    <View style={[s.kmBox,kmRT&&s.kmBoxOn]}>{kmRT&&<Text style={s.kmBoxTxt}>✓</Text>}</View>
                    <Text style={s.kmCheckTxt}>Aller-retour (×2)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.kmCheck} onPress={()=>setKmEveryDay(v=>!v)}>
                    <View style={[s.kmBox,kmEveryDay&&s.kmBoxOn]}>{kmEveryDay&&<Text style={s.kmBoxTxt}>✓</Text>}</View>
                    <Text style={s.kmCheckTxt}>Trajet chaque jour travaillé (× nb jours)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.kmCheck} onPress={()=>setKmJustify(v=>!v)}>
                    <View style={[s.kmBox,kmJustify&&s.kmBoxOn]}>{kmJustify&&<Text style={s.kmBoxTxt}>✓</Text>}</View>
                    <Text style={s.kmCheckTxt}>Je justifie un trajet de plus de 40 km</Text>
                  </TouchableOpacity>
                  {(!kmJustify&&pf(kmDistance)>40)?<View style={{flexDirection:'row',alignItems:'flex-start',gap:5}}><Ionicons name="warning-outline" size={13} color={C.orange} style={{marginTop:2}} /><Text style={[s.miniHint,{color:C.orange,fontWeight:'700',flex:1}]}>Trajet plafonné à 40 km (règle domicile-travail). Coche ci-dessus si tu peux justifier la distance réelle.</Text></View>:null}
                  <TouchableOpacity style={s.kmCalcBtn} onPress={calcKm} disabled={kmCalc}>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}>{!kmCalc&&<Ionicons name="location-outline" size={14} color={C.petrol} />}<Text style={s.kmCalcTxt}>{kmCalc?'Calcul…':'Calculer la distance'}</Text></View>
                  </TouchableOpacity>
                  <View style={s.row}>
                    <View style={{flex:1}}>
                      <Text style={s.label}>Kilomètres</Text>
                      <NumInput style={s.input} value={kmDistance} onChangeText={setKmDistance} placeholder="0" placeholderTextColor={C.muted}/>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={s.label}>Taux €/km (manuel)</Text>
                      <NumInput style={[s.input,kmCv?{opacity:0.5}:null]} value={kmRate} onChangeText={(t:string)=>{setKmRate(t);if(t)setKmCv('');}} placeholder="sinon choisis CV" placeholderTextColor={C.muted}/>
                    </View>
                  </View>
                  <Text style={s.label}>Puissance fiscale</Text>
                  <View style={s.cvWrap}>
                    {BAREME.map(o=>(
                      <TouchableOpacity key={o.key} style={[s.cvChip,kmCv===o.key&&s.cvChipOn]} onPress={()=>setKmCv(c=>c===o.key?'':o.key)}><Text style={kmCv===o.key?s.cvChipTxtOn:s.cvChipTxt}>{o.label}</Text></TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.label}>Tes km parcourus par an (environ)</Text>
                  <View style={s.cvWrap}>
                    {TRANCHE_OPTIONS.map(o=>(
                      <TouchableOpacity key={o.key} style={[s.cvChip,kmTranche===o.key&&s.cvChipOn]} onPress={()=>setKmTranche(o.key)}><Text style={kmTranche===o.key?s.cvChipTxtOn:s.cvChipTxt}>{o.label}</Text></TouchableOpacity>
                    ))}
                  </View>
                  {(kmEff(kmWorkedDays)>0 && !kmCv && pf(kmRate)<=0)
                    ? <Text style={[s.miniHint,{color:C.orange,fontWeight:'700'}]}>Choisis ta puissance fiscale ci-dessus (ou entre un taux €/km) pour estimer les frais.</Text>
                    : <View style={s.kmResult}>
                        <Text style={s.kmResultLine}>Distance comptée : <Text style={{fontWeight:'900'}}>{Math.round(kmEff(kmWorkedDays))} km</Text>{(kmRT||kmEveryDay||(!kmJustify&&pf(kmDistance)>40))?`  =  ${Math.round(kmBase())} km${(!kmJustify&&pf(kmDistance)>40)?' (plafond 40)':''}${kmRT?' × 2 (A/R)':''}${kmEveryDay?` × ${kmWorkedDays} j`:''}`:''}</Text>
                        <Text style={s.kmResultFrais}>Frais estimés : {money(Math.round(kmFraisFor(kmWorkedDays)))}{kmCv?`  ·  ${trancheLabel(kmTranche)}`:''}</Text>
                      </View>}
                  <Text style={s.miniHint}>Tu choisis ta tranche selon ton kilométrage annuel : le coefficient €/km correspondant s&apos;applique (ex. 7 CV : 0,697 si ≤5 000 · 0,394 si 5 001–20 000 · 0,470 si &gt;20 000).</Text>
                </View>
              )}

              {!editId&&<Text style={s.miniHint}>Pour une période de 3 jours ou plus, tu pourras choisir les jours travaillés à l'étape suivante.</Text>}

              <GradientButton onPress={handleSave} disabled={saving} style={s.saveBtn} textStyle={s.saveBtnTxt} label={saving?'Enregistrement…':(editId?'Mettre à jour':'Enregistrer la mission')} />
              {editId&&(
                <TouchableOpacity style={s.deleteBtn} onPress={deleteMission}>
                  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Ionicons name="trash-outline" size={15} color={C.danger}/><Text style={s.deleteBtnTxt}>Supprimer cette mission</Text></View>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.cancelBtn} onPress={()=>{setShowForm(false);setEditId(null);}}>
                <Text style={s.cancelBtnTxt}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showMdp} animationType="slide" transparent onRequestClose={()=>setShowMdp(false)}>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Quels jours as-tu travaillés ?</Text>
              <Text style={s.miniHint}>Coche les jours travaillés et ajuste les heures de chaque jour.</Text>
              <View style={s.mdpTools}>
                <TouchableOpacity style={s.mdpTool} onPress={()=>setAll(true)}><Text style={s.mdpToolTxt}>Tout cocher</Text></TouchableOpacity>
                <TouchableOpacity style={s.mdpTool} onPress={()=>setAll(false)}><Text style={s.mdpToolTxt}>Tout décocher</Text></TouchableOpacity>
              </View>
              <Text style={s.mdpFillLbl}>Mettre tous les jours cochés à :</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12}}>
                {[4,8,10,12].map(h=>(
                  <TouchableOpacity key={h} style={s.mdpTool} onPress={()=>setMdpDays(ds=>ds.map(d=>d.checked?{...d,hours:h}:d))}>
                    <Text style={s.mdpToolTxt}>{h}h</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {mdpDays.map((d,i)=>(
                <View key={d.date} style={[s.mdpDay,!d.checked&&{opacity:0.5}]}>
                  <TouchableOpacity style={[s.checkbox,d.checked&&s.checkboxOn]} onPress={()=>toggleDay(i)}>
                    {d.checked&&<Text style={s.checkmark}>✓</Text>}
                  </TouchableOpacity>
                  <Text style={s.mdpDayLabel} numberOfLines={1}>{frDay(d.date)}</Text>
                  <NumInput style={s.mdpHours} value={String(d.hours)} onChangeText={(v:string)=>setDayHours(i,v)} editable={d.checked}/>
                  <Text style={s.mdpHoursU}>h</Text>
                </View>
              ))}
              <View style={s.mdpTotal}><Text style={s.mdpTotalTxt}>Total : {mdpTotalH} h sur {mdpChecked.length} jour{mdpChecked.length>1?'s':''}</Text></View>
              <GradientButton onPress={confirmDays} style={s.saveBtn} textStyle={s.saveBtnTxt} label="Continuer →" />
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setShowMdp(false)}>
                <Text style={s.cancelBtnTxt}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!dayMenu} animationType="slide" transparent onRequestClose={()=>setDayMenu(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>{dayMenu?(frDay(iso(dayMenu.date)).charAt(0).toUpperCase()+frDay(iso(dayMenu.date)).slice(1)):''}</Text>
              <Text style={s.dayMenuSub}>Que veux-tu faire ?</Text>
              {dayMenu?.missions.map((m:any)=>{
                const hpj=Math.round((Number(m.hours||0)/daysInclusive(new Date((m.mission_date)+'T00:00:00'),new Date((m.end_date||m.mission_date)+'T00:00:00')))*10)/10;
                return(
                  <View key={m.id} style={s.dayMenuItem}>
                    <TouchableOpacity style={{flex:1,flexDirection:'row',alignItems:'center'}} onPress={()=>{const mm=m;setDayMenu(null);openEdit(mm);}}>
                      <View style={{flex:1}}>
                        <Text style={s.dayMenuItemProd} numberOfLines={1}>{m.production||'Mission'}</Text>
                        <Text style={s.dayMenuItemMeta}>{hpj}h/jour · {m.mission_type}</Text>
                      </View>
                      <Text style={s.dayMenuChevron}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.quickDelBtn} onPress={()=>quickDelete(m)} hitSlop={6}>
                      <Ionicons name="close" size={18} color={C.danger}/>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {dayMenu && notesForDate(iso(dayMenu.date)).map((n)=>(
                <TouchableOpacity key={n.id} style={[s.dayMenuItem,{borderLeftWidth:4,borderLeftColor:n.color||'#1E6FE0'}]} onPress={()=>{setDayMenu(null);setNoteDetail(n);}}>
                  <View style={{flex:1}}>
                    <Text style={s.dayMenuItemProd} numberOfLines={1}>{n.title||'Note'}</Text>
                    <Text style={s.dayMenuItemMeta} numberOfLines={1}>{n.text}</Text>
                  </View>
                  <Text style={s.dayMenuChevron}>›</Text>
                </TouchableOpacity>
              ))}
              <View style={s.dmActs}>
                <TouchableOpacity style={[s.dmAct,{borderColor:C.petrol}]} activeOpacity={0.8} onPress={()=>{const dd=dayMenu?.date;setDayMenu(null);if(dd)openCreate(dd);}}>
                  <Ionicons name="briefcase-outline" size={22} color={C.petrol}/>
                  <Text style={[s.dmActTxt,{color:C.petrol}]}>Mission</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dmAct,{borderColor:C.orange}]} activeOpacity={0.8} onPress={()=>{const dd=dayMenu?.date;setDayMenu(null);if(dd){setNoteFormMode('note');setNoteFormEdit(null);setNoteFormDate(iso(dd));setNoteFormOpen(true);}}}>
                  <Ionicons name="document-text-outline" size={22} color={C.orange}/>
                  <Text style={[s.dmActTxt,{color:C.orange}]}>Note</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dmAct,{borderColor:C.petrol}]} activeOpacity={0.8} onPress={()=>{const dd=dayMenu?.date;setDayMenu(null);if(dd){setNoteFormMode('formation');setNoteFormEdit(null);setNoteFormDate(iso(dd));setNoteFormOpen(true);}}}>
                  <Ionicons name="school-outline" size={22} color={C.petrol}/>
                  <Text style={[s.dmActTxt,{color:C.petrol}]}>Formation</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dmAct,{borderColor:'#0EA5E9'}]} activeOpacity={0.8} onPress={()=>{const dd=dayMenu?.date;setDayMenu(null);if(dd)openCreate(dd,'general');}}>
                  <Ionicons name="easel-outline" size={20} color="#0EA5E9"/>
                  <Text style={[s.dmActTxt,{color:'#0EA5E9'}]}>Régime général</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dmAct,{borderColor:C.green}]} activeOpacity={0.8} onPress={()=>{const dd=dayMenu?.date;setDayMenu(null);if(dd){setQuickDate(iso(dd));setQuickOpen(true);}}}>
                  <Ionicons name="flash-outline" size={22} color={C.green}/>
                  <Text style={[s.dmActTxt,{color:C.green}]}>Saisie rapide</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setDayMenu(null)}>
                <Text style={s.cancelBtnTxt}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ProdColorManager visible={managerOpen} productions={allProds} onClose={()=>setManagerOpen(false)} />
      <NoteFormModal visible={noteFormOpen} editNote={noteFormEdit} defaultDate={noteFormDate} mode={noteFormMode} onClose={()=>{setNoteFormOpen(false);setNoteFormEdit(null);}} />
      <QuickEntryModal visible={quickOpen} defaultDate={quickDate} missions={missions} onClose={()=>setQuickOpen(false)} onSaved={()=>loadMissions(true)} />
      <NoteDetailModal note={noteDetail} onClose={()=>setNoteDetail(null)} onEdit={(n)=>{setNoteDetail(null);setNoteFormEdit(n);setNoteFormDate(n.date);setNoteFormOpen(true);}} />
    </ScrollView>
  );
}

const makeS=(C:any)=>StyleSheet.create({
  container:{flex:1,backgroundColor:'transparent'},
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg},
  headerBar:{paddingHorizontal:18,paddingTop:54,paddingBottom:4},
  headerTitle:{fontSize:26,fontWeight:'900',color:C.petrol,letterSpacing:-0.5,borderLeftWidth:5,borderLeftColor:C.petrol,paddingLeft:12},
  nav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingHorizontal:16,paddingVertical:14},
  navBtn:{width:44,height:44,borderRadius:22,backgroundColor:C.soft,justifyContent:'center',alignItems:'center'},
  navTxt:{fontSize:22,fontWeight:'900',color:C.petrol,lineHeight:24},
  navLabel:{flex:1,textAlign:'center',fontSize:16,fontWeight:'900',color:C.petrol,backgroundColor:C.card,borderRadius:16,paddingVertical:14,shadowColor:'#000',shadowOpacity:0.04,shadowRadius:6,elevation:2},
  weekRow:{flexDirection:'row',paddingHorizontal:10,marginBottom:6},
  weekDay:{flex:1,textAlign:'center',fontSize:12,fontWeight:'800',color:C.muted},
  grid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:8},
cell:{width:'14.28%',height:70,padding:5,borderWidth:1.5,borderRadius:14,marginBottom:4,overflow:'hidden',shadowColor:'#000',shadowOpacity:0.03,shadowRadius:3,elevation:1},
  cellEmpty:{backgroundColor:C.card,borderColor:C.line},
  cellFilled:{borderColor:'transparent'},
  cellToday:{backgroundColor:C.card,borderColor:'transparent'},
  todayFrame:{position:'absolute',top:0,left:0,right:0,bottom:0,borderRadius:12.5,borderWidth:2.5,borderColor:C.petrol},
  cellDayToday:{fontWeight:'900'},
  cellDay:{fontSize:14,fontWeight:'800'},
  cellProd:{fontSize:9,fontWeight:'900',marginTop:2},
  cellInfo:{fontSize:8,fontWeight:'600'},
  hint:{textAlign:'center',fontSize:11,color:C.muted,fontStyle:'italic',marginTop:8,marginBottom:4,paddingHorizontal:20},
  listHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:18,marginTop:18,marginBottom:10},
  listTitle:{fontSize:13,fontWeight:'900',color:C.text,letterSpacing:0.5},
  listPage:{fontSize:12,fontWeight:'700',color:C.muted},
  empty:{textAlign:'center',color:C.muted,padding:20},
  missionCard:{backgroundColor:C.card,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',borderLeftWidth:4,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:8,elevation:2},
  mProd:{fontSize:15,fontWeight:'900',color:C.petrol},
  mEmission:{fontSize:12,color:C.text,fontStyle:'italic',flex:1},
  mRow:{flexDirection:'row',alignItems:'center',gap:5},
  mPerday:{fontSize:12,fontWeight:'800',color:C.petrol,marginTop:2},
  mDate:{fontSize:12,color:C.muted,marginTop:3},
  mHours:{fontSize:16,fontWeight:'900',color:C.orange},
  mPill:{backgroundColor:C.soft,borderRadius:8,paddingHorizontal:8,paddingVertical:3},
  mPillTxt:{fontSize:10,fontWeight:'800',color:C.petrol},
  pager:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:16,marginTop:6},
  pagerTxt:{fontSize:12,fontWeight:'900',color:C.petrol},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'flex-end'},
  modalCard:{backgroundColor:C.bg,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'90%'},
  modalTitle:{fontSize:20,fontWeight:'900',color:C.petrol,marginBottom:12,textAlign:'center'},
  miniHint:{fontSize:12,color:C.muted,marginBottom:8,lineHeight:17},
  label:{fontSize:13,fontWeight:'700',color:C.text,marginTop:12,marginBottom:6},
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:13,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:C.card},
  inputTxt:{fontSize:15,color:C.text},
  suggestBox:{backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:14,marginTop:6,overflow:'hidden'},
  suggestItem:{paddingVertical:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:C.soft},
  suggestTxt:{fontSize:15,fontWeight:'700',color:C.petrol},
  row:{flexDirection:'row',gap:10},
  kmHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:16,paddingVertical:12,paddingHorizontal:14,borderRadius:14,backgroundColor:C.soft},
  kmHeadTxt:{fontSize:14,fontWeight:'800',color:C.petrol},
  kmChevron:{fontSize:12,color:C.petrol,fontWeight:'800'},
  kmBody:{marginTop:6,paddingTop:4},
  kmCheck:{flexDirection:'row',alignItems:'center',gap:8,marginTop:12},
  kmBox:{width:24,height:24,borderRadius:7,borderWidth:1,borderColor:C.line,backgroundColor:C.card,alignItems:'center',justifyContent:'center'},
  kmBoxOn:{backgroundColor:C.petrol,borderColor:C.petrol},
  kmBoxTxt:{color:'white',fontWeight:'900',fontSize:13},
  kmCheckTxt:{fontSize:14,fontWeight:'600',color:C.text},
  kmCalcBtn:{backgroundColor:C.soft,borderRadius:12,paddingVertical:12,alignItems:'center',marginTop:12},
  kmCalcTxt:{color:C.petrol,fontWeight:'800',fontSize:14},
  cvWrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},
  cvChip:{paddingVertical:8,paddingHorizontal:12,borderRadius:99,backgroundColor:C.card,borderWidth:1,borderColor:C.line},
  cvChipOn:{backgroundColor:C.petrol,borderColor:C.petrol},
  cvChipTxt:{fontSize:12,fontWeight:'700',color:C.petrol},
  cvChipTxtOn:{fontSize:12,fontWeight:'700',color:'white'},
  kmResult:{marginTop:12,padding:12,borderRadius:12,backgroundColor:C.soft},
  kmResultLine:{fontSize:13,color:C.text,fontWeight:'600'},
  kmResultFrais:{fontSize:16,fontWeight:'900',color:C.petrol,marginTop:4},
  typeWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  typeChip:{paddingVertical:9,paddingHorizontal:14,borderRadius:99,backgroundColor:C.soft},
  typeChipActive:{backgroundColor:C.petrol},
  typeChipTxt:{fontSize:13,fontWeight:'700',color:C.petrol},
  typeChipTxtActive:{fontSize:13,fontWeight:'700',color:'white'},
  typeBtn:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:13,paddingHorizontal:14,borderRadius:14,backgroundColor:C.card,borderWidth:1,borderColor:C.line},
  typeBtnTxt:{fontSize:15,fontWeight:'400',color:C.text},
  addPosteBtn:{backgroundColor:C.petrol,borderRadius:12,paddingHorizontal:16,justifyContent:'center',alignItems:'center'},
  addPosteTxt:{color:'#fff',fontWeight:'800',fontSize:13},
  typeBtnChevron:{fontSize:13,color:C.muted},
  typeGroupLbl:{fontSize:11.5,fontWeight:'800',color:C.muted,marginTop:14,marginBottom:8,textTransform:'uppercase',letterSpacing:0.5},
  typePickerInline:{marginTop:8,padding:12,borderRadius:12,backgroundColor:C.soft,borderWidth:1,borderColor:C.line},
  dayMenuSub:{fontSize:13,color:C.muted,marginBottom:14,textAlign:'center'},
  dayMenuItem:{flexDirection:'row',alignItems:'center',gap:10,padding:13,borderRadius:13,borderWidth:1,borderColor:C.line,marginBottom:8,backgroundColor:C.card},
  dayMenuItemProd:{fontSize:14,fontWeight:'800',color:C.text},
  dayMenuItemMeta:{fontSize:12,color:C.muted,marginTop:2},
  dayMenuChevron:{fontSize:22,color:C.muted,fontWeight:'700'},
  dayMenuAdd:{padding:14,borderRadius:13,backgroundColor:C.soft,alignItems:'center',marginBottom:4,marginTop:4},
  dayMenuAddTxt:{fontSize:14,fontWeight:'800',color:C.petrol},
  saveBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:15,alignItems:'center',marginTop:20},
  saveBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  deleteBtn:{backgroundColor:C.warnBg,borderRadius:15,paddingVertical:14,alignItems:'center',marginTop:10},
  deleteBtnTxt:{color:C.danger,fontWeight:'800',fontSize:14},
  cancelBtn:{paddingVertical:14,alignItems:'center',marginTop:4},
  cancelBtnTxt:{color:C.muted,fontWeight:'700',fontSize:14},
  mdpTools:{flexDirection:'row',gap:8,marginBottom:10},
  mdpTool:{paddingVertical:8,paddingHorizontal:12,borderRadius:10,backgroundColor:C.soft},
  mdpToolTxt:{fontSize:12,fontWeight:'800',color:C.petrol},
  // Sélecteur Heures / Cachets (annexe « les deux ») — couleurs du thème, comme le reste du formulaire.
  mmOpt:{flex:1,paddingVertical:10,borderRadius:11,borderWidth:1.5,borderColor:C.line,backgroundColor:C.card,alignItems:'center'},
  mmOptTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
  // Lien discret « + Ajouter un type de mission » : ne doit pas concurrencer le bouton principal.
  typeAddLink:{fontSize:12,fontWeight:'700',color:C.petrol,marginTop:8,textDecorationLine:'underline'},
  typeCancelTxt:{fontSize:12,fontWeight:'800',color:C.muted,textDecorationLine:'underline'},
  mdpFill:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.soft,borderRadius:11,padding:10,marginBottom:14},
  mdpFillLbl:{fontSize:13,fontWeight:'700',color:C.petrol},
  mdpFillInput:{width:60,backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:9,paddingVertical:6,paddingHorizontal:8,textAlign:'center',fontSize:14,color:C.text},
  mdpDay:{flexDirection:'row',alignItems:'center',gap:11,padding:10,borderWidth:1,borderColor:C.line,borderRadius:12,marginBottom:7,backgroundColor:C.card},
  checkbox:{width:24,height:24,borderRadius:7,borderWidth:2,borderColor:C.petrol,justifyContent:'center',alignItems:'center'},
  checkboxOn:{backgroundColor:C.petrol},
  checkmark:{color:'white',fontWeight:'900',fontSize:14},
  mdpDayLabel:{flex:1,fontSize:13,fontWeight:'700',color:C.text,textTransform:'capitalize'},
  mdpHours:{width:60,backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:9,paddingVertical:7,paddingHorizontal:8,textAlign:'center',fontSize:14,color:C.text},
  mdpHoursU:{fontSize:12,color:C.muted},
  mdpTotal:{backgroundColor:C.soft,borderRadius:11,padding:12,marginTop:6,marginBottom:8},
  mdpTotalTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
  colorRow:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center',marginTop:2},
  colorSw:{width:32,height:32,borderRadius:9,borderWidth:2,borderColor:'transparent',alignItems:'center',justifyContent:'center',overflow:'hidden'},
  colorSwOn:{borderColor:C.text},
  colorAdd:{width:32,height:32,borderRadius:9,borderWidth:1,borderStyle:'dashed',borderColor:C.muted,alignItems:'center',justifyContent:'center'},
  colorAddTxt:{fontSize:18,fontWeight:'800',color:C.muted,lineHeight:20},
  colorTools:{flexDirection:'row',gap:8,paddingHorizontal:16,marginTop:2,marginBottom:8},
  colorToolBtn:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:11,paddingHorizontal:8,borderRadius:12,backgroundColor:C.soft},
  colorToolTxt:{fontSize:11.5,fontWeight:'800',color:C.petrol,textAlign:'center'},
  resetCalBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,marginHorizontal:16,marginTop:2,marginBottom:10,paddingVertical:11,borderRadius:12,borderWidth:1,borderColor:C.danger,backgroundColor:'transparent'},
  resetCalTxt:{fontSize:12.5,fontWeight:'800',color:C.danger},
  modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  modalClose:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:C.soft},
  quickDelBtn:{width:32,height:32,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:C.danger+'1A',marginLeft:2},
  calTabs:{flexDirection:'row',gap:8,marginHorizontal:16,marginTop:18,marginBottom:12,backgroundColor:C.soft,borderRadius:12,padding:5},
  calTab:{flex:1,paddingVertical:9,borderRadius:9,alignItems:'center'},
  calTabOn:{backgroundColor:C.card,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:6,elevation:2},
  calTabTxt:{fontSize:12.5,fontWeight:'800',color:C.muted},
  calTabTxtOn:{fontSize:12.5,fontWeight:'800',color:C.petrol},
  // Encadré "activité hors intermittence" : 2 cas exposés côte à côte, on choisit en connaissance de cause.
  // Toutes les couleurs viennent du thème (C) → suit Sombre, Rock, Noir & Or, etc. Seul l'accent
  // enseignement (#0EA5E9) est fixe : c'est la couleur du segment correspondant sur la jauge.
  rgBox:{backgroundColor:C.soft,borderWidth:1,borderColor:C.line,borderRadius:14,padding:13,marginBottom:6},
  rgTitle:{fontSize:14,fontWeight:'900',color:C.text},
  rgLead:{fontSize:12.5,color:C.muted,lineHeight:17,marginTop:3,marginBottom:10},
  rgOpt:{backgroundColor:C.card,borderWidth:1.5,borderColor:C.line,borderRadius:12,padding:11,marginBottom:8},
  rgOptOn:{borderColor:'#0EA5E9'},
  rgOptHead:{flexDirection:'row',alignItems:'center',gap:9},
  rgRadio:{width:19,height:19,borderRadius:10,borderWidth:1.5,borderColor:C.line,backgroundColor:C.card,
    alignItems:'center',justifyContent:'center',flexShrink:0},
  rgRadioOn:{borderColor:'#0EA5E9'},
  rgRadioDot:{width:9,height:9,borderRadius:5,backgroundColor:'#0EA5E9'},
  rgOptTitle:{flex:1,fontSize:13.5,fontWeight:'900',color:C.text},
  rgOptEx:{fontSize:12,color:C.muted,lineHeight:16.5,marginTop:6},
  rgOptTag:{alignSelf:'flex-start',fontSize:10.5,fontWeight:'900',letterSpacing:0.2,
    paddingVertical:3,paddingHorizontal:8,borderRadius:20,marginTop:8,overflow:'hidden'},
  rgInfo:{fontSize:12,color:C.muted,lineHeight:17,marginTop:2},
  dmActs:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:10,marginBottom:4},
  dmAct:{flexGrow:1,flexBasis:'46%',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:16,paddingHorizontal:8,borderRadius:14,borderWidth:1.5,backgroundColor:C.card},
  dmActTxt:{fontSize:13,fontWeight:'800',textAlign:'center'},
});