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
import ColorPickerModal from '../../components/ColorPickerModal';
import ProdColorManager from '../../components/ProdColorManager';
import NoteFormModal from '../../components/NoteFormModal';
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
function frDay(ds:string){return new Date(ds+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});}
function daysInclusive(a:Date,b:Date){return Math.max(1,Math.round((b.getTime()-a.getTime())/86400000)+1);}
function isNextDay(aStr:string,bStr:string){const a=new Date(aStr+'T00:00:00');a.setDate(a.getDate()+1);return iso(a)===bStr;}

export default function Calendar(){
  useTrackView('calendar');
  const C = useTheme();
  const { scheme } = useThemeControls();
  const s = useMemo(() => makeS(C), [C]);
  const { getColor, setColor, custom, addCustom, reset } = useProdColors();
  const [colorPickerOpen,setColorPickerOpen]=useState(false);
  const [managerOpen,setManagerOpen]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [importMode,setImportMode]=useState<'calendar'|'excel'>('calendar');
  const { notes, notesForDate } = useNotes();
  const [noteFormOpen,setNoteFormOpen]=useState(false);
  const [noteFormEdit,setNoteFormEdit]=useState<Note|null>(null);
  const [noteFormDate,setNoteFormDate]=useState('');
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

  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState<string|null>(null);
  const [fProduction,setFProduction]=useState('');
  const [fEmission,setFEmission]=useState('');
  const [fType,setFType]=useState('Montage');
  const [showTypePicker,setShowTypePicker]=useState(false);
  const [fVacations,setFVacations]=useState('');
  const [dayMenu,setDayMenu]=useState<{date:Date;missions:any[]}|null>(null);
  const [fStart,setFStart]=useState(new Date());
  const [fEnd,setFEnd]=useState(new Date());
  const [fHours,setFHours]=useState('');
  const [fGross,setFGross]=useState('');
  const [showStartPicker,setShowStartPicker]=useState(false);
  const [showEndPicker,setShowEndPicker]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showSuggest,setShowSuggest]=useState(false);
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

  function openCreate(day:Date){
    setEditId(null);
    setFProduction(''); setFEmission(''); setFLieu(''); setShowLieuSuggest(false); setNewPoste(''); setFType('Montage'); setFStart(day); setFEnd(day);
    setFHours(''); setFGross(''); setFVacations(''); setMdpDays([]);
    setKmOpen(false); setKmFrom(''); setKmTo(''); setKmFromCoords(null); setKmToCoords(null); setKmRT(false); setKmEveryDay(false); setKmJustify(false); setKmCv(''); setKmTranche('1'); setKmDistance(''); setKmRate('');
    setShowSuggest(false); setShowEmSuggest(false);
    setShowForm(true);
  }
  function openEdit(m:any){
    setEditId(m.id);
    setFProduction(m.production||''); setFEmission(m.emission||''); setFLieu(m.lieu||''); setShowLieuSuggest(false); setNewPoste(''); setFType(m.mission_type||'Montage');
    setFStart(new Date((m.mission_date)+'T00:00:00'));
    setFEnd(new Date((m.end_date||m.mission_date)+'T00:00:00'));
    setFHours(String(m.hours||'')); setFGross(String(m.gross_amount||'')); setFVacations(String(m.vacations||''));
    setKmFrom(''); setKmTo(''); setKmFromCoords(null); setKmToCoords(null); setKmRT(false); setKmEveryDay(false); setKmJustify(false); setKmCv(''); setKmTranche('1');
    setKmDistance(m.km_distance?String(m.km_distance):''); setKmRate(m.km_rate?String(m.km_rate):'');
    setKmOpen(!!(m.km_distance||m.km_amount));
    setShowSuggest(false); setShowEmSuggest(false);
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
    const payload={
      user_id:user.id, production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, lieu:fLieu.trim()||null, mission_type:fType,
      mission_date:startISO, end_date:endISO!==startISO?endISO:null,
      hours:Number(fHours)||0, vacations:Number(fVacations)||Math.round((Number(fHours)||0)/8),
      gross_amount:Number(fGross)||0, status:'effectue',
      km_distance:Math.round(kmEff(kmWorkedDays)), km_rate:pf(kmRate),
      km_amount:Math.round(kmFraisFor(kmWorkedDays)*100)/100,
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
    if(!fHours.trim()){ showAlert('Heures manquantes','Indique le nombre d\'heures.'); return; }
    const nb=daysInclusive(fStart,fEnd);
    if(!editId && nb>=2){
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

  function onCellPress(d:Date){
    setDayMenu({date:d,missions:missionsOn(d)});
  }
  // Suggestions de production : on prend les productions déjà saisies (dans `missions`),
  // sans doublons, insensible à la casse, et on garde celles qui contiennent le texte tapé.
  const prodQuery=fProduction.trim().toUpperCase();
  const knownProductions=Array.from(new Set(missions.map((m:any)=>(m.production||'').toUpperCase().trim()).filter(Boolean)));
  const prodSuggestions=prodQuery?knownProductions.filter(p=>p.includes(prodQuery)&&p!==prodQuery).slice(0,5):[];

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
        <Text style={s.navLabel}>{monthLabel(current)}</Text>
        <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(1)}><Text style={s.navTxt}>›</Text></TouchableOpacity>
      </View>

      <Text style={{marginHorizontal:16,marginTop:2,marginBottom:6,fontSize:12.5,fontWeight:'700',color:C.muted}}>Importer mes missions</Text>
      <View style={{flexDirection:'row',gap:8,marginHorizontal:14,marginBottom:10}}>
        <TouchableOpacity onPress={()=>{setImportMode('calendar');setShowImport(true);}} activeOpacity={0.85} style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:12,borderRadius:12,borderWidth:1.5,borderColor:C.petrol,backgroundColor:C.soft}}>
          <Ionicons name="calendar-outline" size={17} color={C.petrol}/>
          <Text style={{color:C.petrol,fontWeight:'800',fontSize:12.5}}>Calendrier</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={()=>{setImportMode('excel');setShowImport(true);}} activeOpacity={0.85} style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:12,borderRadius:12,borderWidth:1.5,borderColor:C.petrol,backgroundColor:C.soft}}>
          <Ionicons name="document-text-outline" size={17} color={C.petrol}/>
          <Text style={{color:C.petrol,fontWeight:'800',fontSize:12.5}}>Excel / CSV</Text>
        </TouchableOpacity>
      </View>

      <CalendarImportModal visible={showImport} mode={importMode} onClose={()=>setShowImport(false)} onImported={()=>loadMissions()}/>

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
          <Text style={s.colorToolTxt}>Réinitialiser</Text>
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
          const grad=(!isToday&&fillable)?(customCol?prodGradient(customCol):(isPast?GRAD_PAST:GRAD_FUTURE)):null;
          const filled=grad!=null;
          const hach=filled&&(noteOnly||(isPast&&!!customCol)); // notes hachurées ; missions passées perso hachurées
          const baseTxt=customCol?textOn(customCol):'#fff';
          const txtColor=isToday?C.petrol:(filled?baseTxt:C.text);
          const subColor=isToday?C.muted:(filled?(customCol?baseTxt:'rgba(255,255,255,.85)'):C.muted);
          return(
            <TouchableOpacity key={i} style={[s.cell,isToday?s.cellToday:(filled?s.cellFilled:s.cellEmpty)]} activeOpacity={0.85} onPress={()=>onCellPress(d)}>
              {grad&&<LinearGradient colors={grad} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>}
              {hach&&<Svg width={84} height={80} style={{position:'absolute',top:0,left:0}}>{Array.from({length:22},(_,k)=>{const o=-84+k*9;return <Line key={k} x1={o} y1={0} x2={o+84} y2={84} stroke="rgba(255,255,255,0.30)" strokeWidth={2.5}/>;})}</Svg>}
              {isToday&&<Animated.View pointerEvents="none" style={[s.todayFrame,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[0.35,1]})}]}/>}
              {noteMark&&<View pointerEvents="none" style={{position:'absolute',top:4,right:4,width:8,height:8,borderRadius:3,backgroundColor:(note0&&note0.color)||'#1E6FE0',zIndex:3}}/>}
              <Text style={[s.cellDay,{color:txtColor},isToday&&s.cellDayToday]}>{d.getDate()}</Text>
              {first&&(
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
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>{editId?'Modifier la mission':'Ajouter une mission'}</Text>

              <Text style={s.label}>Nom de la production</Text>
              <TxtInput style={s.input} value={fProduction} onChangeText={(t:string)=>{setFProduction(t);setShowSuggest(true);}} onFocus={()=>setShowSuggest(true)} placeholder="Ex : ENDEMOL" placeholderTextColor={C.muted} autoCapitalize="characters"/>
              {showSuggest&&prodSuggestions.length>0&&(
                <View style={s.suggestBox}>
                  {prodSuggestions.map(p=>(
                    <TouchableOpacity key={p} style={s.suggestItem} onPress={()=>{setFProduction(p);setShowSuggest(false);}}>
                      <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="repeat" size={13} color={C.petrol} /><Text style={s.suggestTxt}>{p}</Text></View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

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
              <TouchableOpacity style={s.typeBtn} onPress={()=>setShowTypePicker(v=>!v)}>
                <Text style={s.typeBtnTxt}>{fType}</Text>
                <Text style={s.typeBtnChevron}>{showTypePicker?'▴':'▾'}</Text>
              </TouchableOpacity>
              {showTypePicker && (
                <View style={s.typePickerInline}>
                  <View style={s.typeWrap}>
                    {['Montage','Tournage','Démontage'].map(p=>(
                      <TouchableOpacity key={p} style={[s.typeChip,fType===p&&s.typeChipActive]} onPress={()=>{setFType(p);setShowTypePicker(false);}}>
                        <Text style={fType===p?s.typeChipTxtActive:s.typeChipTxt}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {postes.length>0 && (
                    <View>
                      <Text style={s.typeGroupLbl}>Mes postes</Text>
                      <View style={s.typeWrap}>
                        {postes.map(p=>(
                          <View key={p} style={[s.typeChip,fType===p&&s.typeChipActive,{flexDirection:'row',alignItems:'center',gap:6}]}>
                            <TouchableOpacity onPress={()=>{setFType(p);setShowTypePicker(false);}}><Text style={fType===p?s.typeChipTxtActive:s.typeChipTxt}>{p}</Text></TouchableOpacity>
                            <TouchableOpacity onPress={()=>removePoste(p)} hitSlop={8}><Text style={{color:fType===p?'#fff':C.muted,fontWeight:'900',fontSize:13}}>×</Text></TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={s.typeGroupLbl}>Ajouter un poste</Text>
                  <View style={{flexDirection:'row',gap:8}}>
                    <TxtInput style={[s.input,{flex:1}]} value={newPoste} onChangeText={setNewPoste} placeholder="Ex : Clown, Cascadeur…" placeholderTextColor={C.muted}/>
                    <TouchableOpacity style={s.addPosteBtn} onPress={()=>{const v=newPoste.trim();if(v){addPoste(v);setFType(v);setNewPoste('');setShowTypePicker(false);}}}><Text style={s.addPosteTxt}>Ajouter</Text></TouchableOpacity>
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
                <DateTimePicker value={fStart} mode="date" themeVariant={scheme} display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowStartPicker(false);if(date){setFStart(date);if(date>fEnd)setFEnd(date);}}}/>
              )}
              {showEndPicker&&(
                <DateTimePicker value={fEnd} mode="date" themeVariant={scheme} display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowEndPicker(false);if(date){setFEnd(date);if(!editId&&daysInclusive(fStart,date)>=2)openDayPicker(fStart,date);}}}/>
              )}

              <Text style={s.label}>Heures cumulées</Text>
              <NumInput style={s.input} value={fHours} onChangeText={setFHours} placeholder="8" placeholderTextColor={C.muted}/>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8}}>
                {[4,8,12].map(h=>(
                  <TouchableOpacity key={h} style={s.mdpTool} onPress={()=>setFHours(String(h))}>
                    <Text style={s.mdpToolTxt}>{h}h</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(!editId && daysInclusive(fStart,fEnd)>=2) ? (
                <TouchableOpacity style={s.kmCalcBtn} onPress={()=>openDayPicker(fStart,fEnd)}>
                  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Ionicons name="calendar-outline" size={14} color={C.petrol} /><Text style={s.kmCalcTxt}>{mdpChecked.length>0?`${mdpChecked.length} jour(s) travaillé(s) · modifier`:'Choisir les jours travaillés'}</Text></View>
                </TouchableOpacity>
              ) : null}

              <Text style={s.label}>Nombre de vacations / cachets</Text>
              <NumInput style={s.input} value={fVacations} onChangeText={setFVacations} placeholder="Ex : 1" placeholderTextColor={C.muted}/>
              <Text style={s.miniHint}>Nombre de jours / cachets. Se remplit tout seul depuis le sélecteur de jours. 1 vacation = 1 jour (technicien) · 1 cachet (artiste / musicien).</Text>

              <Text style={s.label}>Montant brut (€)</Text>
              <NumInput style={s.input} value={fGross} onChangeText={setFGross} placeholder="0" placeholderTextColor={C.muted}/>

              <TouchableOpacity style={s.kmHead} onPress={()=>setKmOpen(o=>!o)}>
                <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="car-outline" size={14} color={C.petrol} /><Text style={s.kmHeadTxt}>Frais kilométriques (optionnel)</Text></View>
                <Text style={s.kmChevron}>{kmOpen?'▲':'▼'}</Text>
              </TouchableOpacity>
              {kmOpen&&(
                <View style={s.kmBody}>
                  <Text style={s.label}>Lieu de départ</Text>
                  <AddressInput style={s.input} value={kmFrom} onChangeText={setKmFrom} onCoords={setKmFromCoords} placeholder="Ville / adresse de départ"/>
                  <Text style={s.label}>Lieu d'arrivée</Text>
                  <AddressInput style={s.input} value={kmTo} onChangeText={setKmTo} onCoords={setKmToCoords} placeholder="Ville / adresse d'arrivée"/>
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
                  <TouchableOpacity key={m.id} style={s.dayMenuItem} onPress={()=>{const mm=m;setDayMenu(null);openEdit(mm);}}>
                    <View style={{flex:1}}>
                      <Text style={s.dayMenuItemProd} numberOfLines={1}>{m.production||'Mission'}</Text>
                      <Text style={s.dayMenuItemMeta}>{hpj}h/jour · {m.mission_type}</Text>
                    </View>
                    <Text style={s.dayMenuChevron}>›</Text>
                  </TouchableOpacity>
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
                  <Ionicons name="briefcase-outline" size={24} color={C.petrol}/>
                  <Text style={[s.dmActTxt,{color:C.petrol}]}>Ajouter une mission</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dmAct,{borderColor:C.orange}]} activeOpacity={0.8} onPress={()=>{const dd=dayMenu?.date;setDayMenu(null);if(dd){setNoteFormEdit(null);setNoteFormDate(iso(dd));setNoteFormOpen(true);}}}>
                  <Ionicons name="document-text-outline" size={24} color={C.orange}/>
                  <Text style={[s.dmActTxt,{color:C.orange}]}>Note perso</Text>
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
      <NoteFormModal visible={noteFormOpen} editNote={noteFormEdit} defaultDate={noteFormDate} onClose={()=>{setNoteFormOpen(false);setNoteFormEdit(null);}} />
      <NoteDetailModal note={noteDetail} onClose={()=>setNoteDetail(null)} onEdit={(n)=>{setNoteDetail(null);setNoteFormEdit(n);setNoteFormDate(n.date);setNoteFormOpen(true);}} />
    </ScrollView>
  );
}

const makeS=(C:any)=>StyleSheet.create({
  container:{flex:1,backgroundColor:C.bg},
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
  mdpFill:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.soft,borderRadius:11,padding:10,marginBottom:14},
  mdpFillLbl:{fontSize:13,fontWeight:'700',color:C.petrol},
  mdpFillInput:{width:60,backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:9,paddingVertical:6,paddingHorizontal:8,textAlign:'center',fontSize:14},
  mdpDay:{flexDirection:'row',alignItems:'center',gap:11,padding:10,borderWidth:1,borderColor:C.line,borderRadius:12,marginBottom:7,backgroundColor:C.card},
  checkbox:{width:24,height:24,borderRadius:7,borderWidth:2,borderColor:C.petrol,justifyContent:'center',alignItems:'center'},
  checkboxOn:{backgroundColor:C.petrol},
  checkmark:{color:'white',fontWeight:'900',fontSize:14},
  mdpDayLabel:{flex:1,fontSize:13,fontWeight:'700',color:C.text,textTransform:'capitalize'},
  mdpHours:{width:60,backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:9,paddingVertical:7,paddingHorizontal:8,textAlign:'center',fontSize:14},
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
  calTabs:{flexDirection:'row',gap:8,marginHorizontal:16,marginTop:18,marginBottom:12,backgroundColor:C.soft,borderRadius:12,padding:5},
  calTab:{flex:1,paddingVertical:9,borderRadius:9,alignItems:'center'},
  calTabOn:{backgroundColor:C.card,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:6,elevation:2},
  calTabTxt:{fontSize:12.5,fontWeight:'800',color:C.muted},
  calTabTxtOn:{fontSize:12.5,fontWeight:'800',color:C.petrol},
  dmActs:{flexDirection:'row',gap:10,marginTop:10,marginBottom:4},
  dmAct:{flex:1,alignItems:'center',justifyContent:'center',gap:8,paddingVertical:18,paddingHorizontal:8,borderRadius:14,borderWidth:1.5,backgroundColor:C.card},
  dmActTxt:{fontSize:13,fontWeight:'800',textAlign:'center'},
});