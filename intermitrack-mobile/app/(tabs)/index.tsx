import { showAlert } from "../../lib/dialog";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useTrackView } from '../../lib/analytics';
import { CONFIG, CHARGE_DEFAUT } from '../../lib/calcul';
import Gauge from '../../components/Gauge';
import NumInput from '../../components/NumInput';
import KmSection, { KmHandle } from '../../components/KmSection';
import TxtInput from '../../components/TxtInput';
import { GradientButton } from '../../components/GradientButton';
import { openMesInfos, onProfilChanged } from '../../components/AccountMenu';
import { typeParts, addType, removeType } from '../../lib/missionType';
import ProductionPickerModal from '../../components/ProductionPickerModal';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemeControls } from '../../lib/theme';
import { useNotes } from '../../lib/notes';

const FORM_CAP = 338; // heures de formation prises en compte pour les 507 h : plafond 2/3
// Enseignement dispensé (contrat régime général avec un établissement AGRÉÉ, en lien avec le métier) :
// il compte dans les 507 h, plafonné à 70 h — ou 120 h à partir de 50 ans à la fin du contrat.
// On retient le MAXIMUM légal pour ne léser personne ; le formulaire explique la règle.
// ⚠️ Le plafond de 338 h est GLOBAL : formation suivie + enseignement dispensé réunis (guide France Travail).
const ENS_CAP = 120;

// La palette vient maintenant du thème (lib/theme) → const C = useTheme() dans le composant.
const POSTES_TECH = ['Montage','Tournage','Démontage','Régie','Son','Lumière','Image / Vidéo','Machiniste','Électricien','Poursuiteur','Plateau','Décor','HMC'];
const POSTES_ARTISTE = ['Comédien','Chanteur','Musicien','Danseur','Choriste'];
const POSTES_MUSIQUE = ['Concert','Répétition','Session studio','Atelier / Pédagogique','Tournée','Captation'];
const POSTES_AUTRE = ['Autres'];

function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function fmtPeriod(s:string,e:string){if(!e||e===s)return fmtDate(s);return fmtDate(s)+' → '+fmtDate(e);}
function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function monthLabel(d:Date){return d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});}
function isoToDisplay(iso:string){if(!iso)return'';const[y,m,d]=iso.split('-');return`${d}/${m}/${y}`;}
function iso(d:Date){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

export default function HomeScreen(){
  useTrackView('dashboard');
  const insets=useSafeAreaInsets();
  const C=useTheme();
  const { scheme }=useThemeControls();
  const s=useMemo(()=>makeS(C),[C]);
  const mp=useMemo(()=>makeMp(C),[C]);
  const { notes }=useNotes();
  const [loading,setLoading]=useState(true);
  const [missions,setMissions]=useState<any[]>([]);
  const [current,setCurrent]=useState(new Date());
  const [missionPage,setMissionPage]=useState(0);
  const [areDate,setAreDate]=useState('');
  const [clauseRattrapage,setClauseRattrapage]=useState(false);
  const [yearOffset,setYearOffset]=useState(0); // navigation dans l'historique des années d'intermittence (0 = année en cours)
  const [showDatePicker,setShowDatePicker]=useState(false);
  const [showMonthPicker,setShowMonthPicker]=useState(false);
  const [pickerYear,setPickerYear]=useState(new Date().getFullYear());

  const [profil,setProfil]=useState<any>(null);

  const kmRef=useRef<KmHandle>(null);
  const [editKmDist,setEditKmDist]=useState(0);
  const [editKmRate,setEditKmRate]=useState(0);
  const [editId,setEditId]=useState<string|null>(null);
  const [fProduction,setFProduction]=useState('');
  const [fEmission,setFEmission]=useState('');
  const [fType,setFType]=useState('');
  const [showTypePicker,setShowTypePicker]=useState(false);
  // true = le choix s'AJOUTE au type courant (« Rec + MIX ») ; false = il le remplace (cas courant).
  const [typeAddMode,setTypeAddMode]=useState(false);
  const [showProdPicker,setShowProdPicker]=useState(false);
  const [fVacations,setFVacations]=useState('');
  const [fStart,setFStart]=useState(new Date());
  const [fEnd,setFEnd]=useState(new Date());
  const [fHours,setFHours]=useState('');
  const [fGross,setFGross]=useState('');
  const [showStartPicker,setShowStartPicker]=useState(false);
  const [showEndPicker,setShowEndPicker]=useState(false);
  const [saving,setSaving]=useState(false);
  const [areVerse,setAreVerse]=useState<Record<string,number>>({}); // ARE réellement versé, par mois 'AAAA-MM'
  const [areInput,setAreInput]=useState('');            // champ de saisie ARE versé du mois affiché
  const [netInputs,setNetInputs]=useState<Record<string,string>>({}); // saisie du net réel par mission (id → texte)
  const [reelPage,setReelPage]=useState(0);             // pagination de la liste des montants réels (7 / page)
  const [savingReal,setSavingReal]=useState(false);     // enregistrement en cours des montants réels

  useEffect(()=>{loadData();},[]);
  useFocusEffect(useCallback(()=>{loadData(true);},[]));
  // Rechargement immédiat quand on modifie « Mes informations » (annexe artiste/technicien, taux…) depuis la modale, qui ne change pas le focus de l'écran.
  useEffect(()=>onProfilChanged(()=>loadData(true)),[]);

  async function loadData(silent=false){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:true});
    if(data)setMissions(data);
    // ARE réellement versé par mois (table are_versements). try/catch : si la migration n'est pas encore
    // passée, l'appli continue de tourner sans les montants réels.
    try{ const{data:av}=await supabase.from('are_versements').select('mois,montant'); if(av){const map:Record<string,number>={};for(const r of av as any[])map[r.mois]=Number(r.montant)||0;setAreVerse(map);} }catch(e){}
    const saved=await AsyncStorage.getItem('intermitrack_are_date');
    if(saved)setAreDate(saved);
    const { data:{ user } }=await supabase.auth.getUser();
    if(user){
      const { data:prof }=await supabase.from('profiles').select('annexe,droits_ouverts,taux_journalier,taux_impot,are_date,clause_rattrapage').eq('id',user.id).maybeSingle();
      setClauseRattrapage(!!prof?.clause_rattrapage);
      setProfil(prof||null);
      // Date ARE : la base de données fait foi (persiste sur tous les appareils).
      // Sinon, on migre une éventuelle valeur locale (ancienne) vers la base.
      if(prof?.are_date){ setAreDate(prof.are_date); await AsyncStorage.setItem('intermitrack_are_date',prof.are_date); }
      else if(saved){ await supabase.from('profiles').upsert({id:user.id,are_date:saved},{onConflict:'id'}); }
    }
    if(!silent)setLoading(false);
  }

  function moveMonth(n:number){const d=new Date(current);d.setMonth(d.getMonth()+n);d.setDate(1);setCurrent(d);}

  function openEdit(m:any){
    setEditId(m.id);
    setFProduction(m.production||''); setFEmission(m.emission||''); setFType(m.mission_type||'');
    setFStart(new Date(m.mission_date+'T00:00:00'));
    setFEnd(new Date((m.end_date||m.mission_date)+'T00:00:00'));
    setFHours(String(m.hours||'')); setFGross(String(m.gross_amount||'')); setFVacations(String(m.vacations||''));
    setShowTypePicker(false);
    setEditKmDist(Number(m.km_distance) || 0); setEditKmRate(Number(m.km_rate) || 0);
  }

  async function saveEdit(){
    if(!editId)return;
    if(!fProduction.trim()){ showAlert('Production manquante','Indique la production.'); return; }
    setSaving(true);
    const startISO=iso(fStart), endISO=iso(fEnd);
    const nbDays=Math.max(1,Math.min(Math.round((fEnd.getTime()-fStart.getTime())/86400000)+1,Math.round((Number(fHours)||0)/8)));
    const km=kmRef.current?.values(nbDays)||{};
    const { error }=await supabase.from('missions').update({
      production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, mission_type:fType,
      mission_date:startISO, end_date:endISO!==startISO?endISO:null,
      hours:Number(fHours)||0, vacations:Number(fVacations)||Math.round((Number(fHours)||0)/8), gross_amount:Number(fGross)||0,
      ...km,
    }).eq('id',editId);
    setSaving(false);
    if(error){ showAlert('Erreur',error.message); return; }
    setEditId(null); loadData(true);
  }

  async function deleteEdit(){
    if(!editId)return;
    showAlert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error,count }=await supabase.from('missions').delete({count:'exact'}).eq('id',editId);
        if(error){ showAlert('Erreur',error.message); return; }
        if(count===0){ showAlert('Bloqué','Suppression refusée (droits Supabase).'); return; }
        setEditId(null); loadData(true);
      }},
    ]);
  }

  // Employeurs deja saisis, classes du PLUS UTILISE au moins utilise (idem calendrier et missions).
  const knownProductions=useMemo(()=>{
    const counts=missions.reduce((acc:Record<string,number>,m:any)=>{const p=(m.production||'').toUpperCase().trim();if(p)acc[p]=(acc[p]||0)+1;return acc;},{});
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  },[missions]);

  // Taux unifiés : charges sociales selon le statut, impôt = le taux unique de « Mes informations ».
  const chargeRate = CHARGE_DEFAUT[profil?.annexe==='artiste'?'artiste':'technicien'] ?? 22.5;
  const taxRate = Number(profil?.taux_impot)||0;
  const stats=useMemo(()=>{
    const today=new Date();today.setHours(0,0,0,0);
    // Fenêtre « année d'intermittence » : 12 mois à partir de la date ARE (anniversaire), navigable via yearOffset.
    let winStart:Date, winEnd:Date;
    const hasARE = !!areDate;
    if(hasARE){
      const a=new Date(areDate+'T00:00:00');
      let k=today.getFullYear()-a.getFullYear();
      const anniv=new Date(a); anniv.setFullYear(a.getFullYear()+k);
      if(anniv>today) k-=1;               // année d'intermittence en cours (contient aujourd'hui)
      k+=yearOffset;                       // navigation historique (offset ≤ 0)
      winStart=new Date(a); winStart.setFullYear(a.getFullYear()+k);
      winEnd=new Date(a);   winEnd.setFullYear(a.getFullYear()+k+1);
    } else {
      winStart=new Date(today.getFullYear(),0,1);
      winEnd=new Date(today.getFullYear()+1,0,1);
    }
    const winStartT=winStart.getTime(), winEndT=winEnd.getTime();
    const inWin=(isoStr:string)=>{ const t=new Date(isoStr+'T00:00:00').getTime(); return t>=winStartT && t<winEndT; };
    const yearM=missions.filter((m:any)=>inWin(m.mission_date));
    // Répartit une mission en "effectué / prévu". Une mission en cours (à cheval sur
    // aujourd'hui) est comptée au prorata des jours déjà écoulés (même logique que le site).
    const splitT=(m:any)=>{
      const s=new Date(m.mission_date+'T00:00:00').getTime();
      const e=new Date((m.end_date||m.mission_date)+'T00:00:00').getTime();
      const t=today.getTime();
      const tot=Number(m.hours||0);
      if(e<t)return{done:tot,planned:0};
      if(s>t)return{done:0,planned:tot};
      const totalDays=Math.max(1,Math.round((e-s)/86400000)+1);
      const doneDays=Math.max(1,Math.round((t-s)/86400000)+1);
      const done=Math.min(tot,Math.round(tot*(doneDays/totalDays)*10)/10);
      return{done,planned:Math.max(0,Math.round((tot-done)*10)/10)};
    };
    const upcoming=missions.filter((m:any)=>new Date((m.end_date||m.mission_date)+'T00:00:00')>=today);
    // Régime de la mission (colonne Supabase, défaut 'intermittence' → les missions déjà saisies ne bougent pas).
    const regOf=(m:any)=>m.regime||'intermittence';
    // Seules les missions d'intermittence (annexes 8/10) alimentent les heures effectuées / prévues.
    const interM=yearM.filter((m:any)=>regOf(m)==='intermittence');
    const doneH=Math.round(interM.reduce((a:number,m:any)=>a+splitT(m).done,0)*10)/10;
    const planH=Math.round(interM.reduce((a:number,m:any)=>a+splitT(m).planned,0)*10)/10;
    // Heures de formation dans la période de droits (plafonnées à 338 h pour le calcul des 507 h).
    const formRaw=Math.round((notes||[]).filter((n:any)=>n.kind==='formation'&&inWin(n.date)).reduce((a:number,n:any)=>a+(Number(n.hours)||0),0)*10)/10;
    const formH=Math.min(formRaw,FORM_CAP);
    // Enseignement dispensé : compte dans les 507 h, mais plafonné à ENS_CAP *et* dans les 338 h
    // GLOBALES qu'il partage avec la formation suivie (règle France Travail).
    const ensRaw=Math.round(yearM.filter((m:any)=>regOf(m)==='enseignement').reduce((a:number,m:any)=>a+(Number(m.hours)||0),0)*10)/10;
    const ensH=Math.round(Math.min(ensRaw,ENS_CAP,Math.max(0,FORM_CAP-formH))*10)/10;
    // Le régime général « pur » n'entre PAS dans les 507 h — mais bien dans l'estimation mensuelle (monthH plus bas).
    const remaining=Math.max(0,Math.round((507-doneH-planH-formH-ensH)*10)/10);
    // Tout le récap du mois suit la MÊME logique : la part de chaque mission qui tombe DANS le mois (au prorata des jours).
    const _mvS=new Date(current.getFullYear(),current.getMonth(),1).getTime(), _mvE=new Date(current.getFullYear(),current.getMonth()+1,0).getTime();
    const monthDays=(m:any)=>{const s=new Date(m.mission_date+'T00:00:00').getTime(),e=new Date((m.end_date||m.mission_date)+'T00:00:00').getTime();const tot=Math.max(1,Math.round((e-s)/86400000)+1);const p=Math.max(s,_mvS),q=Math.min(e,_mvE);const inM=q<p?0:Math.round((q-p)/86400000)+1;return {inM,frac:inM/tot};};
    // TOTAL du mois pour l'estimation France Travail (toutes missions, régime général compris : tout revenu
    // réduit les jours indemnisables). Le MOIS D'OUVERTURE ne compte qu'À PARTIR de la date ARE : les heures
    // et le brut d'avant le jour d'ouverture ne doivent pas réduire l'indemnisation de ce mois (cohérent avec
    // daysInMonth dans `ft`). Les autres mois = mois plein. N'affecte QUE l'estimation FT (monthHi/monthGi restent pleins).
    let _ftS=_mvS;
    if(areDate){ const _a=new Date(areDate+'T00:00:00'); if(_a.getFullYear()===current.getFullYear()&&_a.getMonth()===current.getMonth()) _ftS=Math.max(_mvS,_a.getTime()); }
    const monthDaysFt=(m:any)=>{const s=new Date(m.mission_date+'T00:00:00').getTime(),e=new Date((m.end_date||m.mission_date)+'T00:00:00').getTime();const tot=Math.max(1,Math.round((e-s)/86400000)+1);const p=Math.max(s,_ftS),q=Math.min(e,_mvE);const inM=q<p?0:Math.round((q-p)/86400000)+1;return {inM,frac:inM/tot};};
    const monthH=Math.round(missions.reduce((a:number,m:any)=>a+Number(m.hours||0)*monthDaysFt(m).frac,0)*10)/10;
    const monthG=Math.round(missions.reduce((a:number,m:any)=>a+Number(m.gross_amount||0)*monthDaysFt(m).frac,0));
    // Récap INTERMITTENCE : le régime général « pur » a sa propre case, il ne gonfle plus heures/brut/vacations.
    const notGen=(m:any)=>regOf(m)!=='general';
    const monthHi=Math.round(missions.filter(notGen).reduce((a:number,m:any)=>a+Number(m.hours||0)*monthDays(m).frac,0)*10)/10;
    const monthGi=Math.round(missions.filter(notGen).reduce((a:number,m:any)=>a+Number(m.gross_amount||0)*monthDays(m).frac,0));
    // Régime général du mois : nombre de déclarations + heures (case dédiée).
    const regGenM=missions.filter((m:any)=>regOf(m)==='general'&&monthDays(m).inM>0);
    const regGenH=Math.round(regGenM.reduce((a:number,m:any)=>a+Number(m.hours||0)*monthDays(m).frac,0)*10)/10;
    const regGenCount=regGenM.length;
    // Formation effectuée ce mois-ci (case dédiée) : notes de type formation datées dans le mois affiché.
    const monthFormH=Math.round((notes||[]).filter((n:any)=>{const d=new Date(n.date+'T00:00:00');return n.kind==='formation'&&d.getMonth()===current.getMonth()&&d.getFullYear()===current.getFullYear();}).reduce((a:number,n:any)=>a+Number(n.hours||0),0)*10)/10;
    const monthVac=Math.round(missions.reduce((a:number,m:any)=>{
      if(regOf(m)==='general') return a; // régime général : PAS une vacation d'intermittence (il a sa propre case)
      // Contrat cachet : on compte les CACHETS réellement travaillés dans le mois (cachet_days),
      // pas les jours de la période (sinon un contrat 10→25 compterait 16 au lieu de 3-4 cachets).
      if(m.cachet_days && typeof m.cachet_days==='object' && !Array.isArray(m.cachet_days)){
        let c=0; for(const k in m.cachet_days){ const t=new Date(k+'T00:00:00').getTime(); if(t>=_mvS&&t<=_mvE) c+=Number(m.cachet_days[k])||0; } return a+c;
      }
      const md=monthDays(m);
      if(m.mission_type==='Saisie rapide') return a+(md.inM>0?(Number(m.vacations)||1):0);
      // On compte les VACATIONS SAISIES (proratisées au mois), pas les jours de la période : une
      // mission « 18→29 » avec 1 seule vacation compte 1, pas 12. (Pour une mission normale, vacations = jours → identique.)
      const v=Number(m.vacations);
      return a+(v>0?v*md.frac:md.inM);
    },0)); // 1 vacation = 1 jour ; cachet = cachet_days ; sinon vacations saisies
    // Récap affiché = INTERMITTENCE (monthHi/monthGi) ; le régime général a sa propre case.
    const monthRate=monthHi>0?Math.round(monthGi/monthHi):0;
    // Net à payer estimé = brut − charges salariales − prélèvement à la source
    // Calibration silencieuse : ratio net/brut appris sur TES montants réels (≥ 2 productions renseignées).
    // Le net réel = ce qui tombe sur le compte (après charges + impôt), donc il remplace tout le calcul.
    const _reelM=missions.filter((m:any)=>Number(m.gross_amount)>0 && Number(m.net_reel)>0);
    const _reelProds=new Set(_reelM.map((m:any)=>(m.production||'').toUpperCase().trim()));
    const _reelBrut=_reelM.reduce((a:number,m:any)=>a+Number(m.gross_amount||0),0);
    const _reelNet=_reelM.reduce((a:number,m:any)=>a+Number(m.net_reel||0),0);
    const calibrated=_reelProds.size>=2 && _reelBrut>0;
    const learnedRatio=calibrated?_reelNet/_reelBrut:null;
    // Net AVANT impôt (net du bulletin) = brut − charges. Net APRÈS impôt = ce qui tombe sur le compte
    // (calibré sur tes montants réels si dispo, sinon net avant impôt − ton taux d'imposition).
    const monthNetAvant=Math.round(monthGi*(1-chargeRate/100));
    const monthNetApres=calibrated?Math.round(monthGi*(learnedRatio as number)):Math.round(monthNetAvant*(1-taxRate/100));
    const monthRateNet=monthHi>0?Math.round(((calibrated||taxRate>0)?monthNetApres:monthNetAvant)/monthHi):0;
    const monthRateNetAvant=monthHi>0?Math.round(monthNetAvant/monthHi):0;
    // % de l'année d'intermittence écoulée vs % des 507 h atteintes (heures validées : effectuées + formation + enseignement).
    const nowT=today.getTime();
    const elapsedFrac=yearOffset<0?1:Math.max(0,Math.min(1,(nowT-winStartT)/(winEndT-winStartT)));
    const progressH=Math.round((doneH+formH+ensH)*10)/10;
    const hoursFrac=Math.max(0,Math.min(1,progressH/507));
    // Montant réel du mois : somme des net réellement perçus des missions du mois (proratisés comme le brut).
    const monthNetReel=Math.round(missions.filter(notGen).reduce((a:number,m:any)=>{const md=monthDays(m);return a+((m.net_reel!=null&&md.inM>0)?Number(m.net_reel)*md.frac:0);},0));
    const monthHasNetReel=missions.some((m:any)=>notGen(m)&&m.net_reel!=null&&monthDays(m).inM>0);
    return { doneH, planH, remaining, formH, formRaw, ensH, ensRaw, monthH, monthG, monthHi, monthGi, regGenH, regGenCount, monthFormH, monthNetAvant, monthNetApres, monthVac, monthRate, monthRateNet, monthRateNetAvant, upcoming, winStart, winEnd, hasARE, elapsedFrac, hoursFrac, progressH, monthNetReel, monthHasNetReel, calibrated, learnedRatio };
  },[missions,notes,areDate,yearOffset,current,chargeRate,taxRate]);

  const { doneH, planH, remaining, formH, formRaw, ensH, ensRaw, monthH, monthG, monthHi, monthGi, regGenH, regGenCount, monthFormH, monthNetAvant, monthNetApres, monthVac, monthRate, monthRateNet, monthRateNetAvant, upcoming, winStart, winEnd, hasARE, elapsedFrac, hoursFrac, progressH, monthNetReel, monthHasNetReel, calibrated, learnedRatio } = stats;
  // Clause de rattrapage : échéance = début de l'année d'intermittence + 6 mois.
  const clauseDeadline = (clauseRattrapage && hasARE && winStart) ? (()=>{ const d=new Date(winStart); d.setMonth(d.getMonth()+6); return d; })() : null;
  const clauseDaysLeft = clauseDeadline ? Math.ceil((clauseDeadline.getTime()-new Date(new Date().setHours(0,0,0,0)).getTime())/86400000) : null;

  // Comparaison rythme (avance/retard) + montants réels du mois affiché.
  const moisKey=current.getFullYear()+'-'+String(current.getMonth()+1).padStart(2,'0');
  const areVerseMonth=Number(areVerse[moisKey]||0);
  const totalReelMonth=Math.round(monthNetReel+areVerseMonth);
  const hasReel=monthHasNetReel||areVerseMonth>0;
  const paceDiff=hoursFrac-elapsedFrac;
  const paceLabel=Math.abs(paceDiff)<=0.03?'Dans les temps':(paceDiff>0?'En avance':'En retard');
  // Vert = en avance (plus d'heures que de temps écoulé) · rouge = en retard · orange = dans les temps.
  const paceColor=Math.abs(paceDiff)<=0.03?(C.orange||'#E8650A'):(paceDiff>0?(C.green||'#2F7A4F'):'#E53E3E');
  // Repères des 12 mois de l'année d'intermittence, à partir du mois de début (ex : Fév).
  const _monShort=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  // Repères alignés sur les VRAIES limites de mois (1er du mois) dans la fenêtre, pas sur des 1/12 égaux :
  // ainsi le remplissage (basé sur la date réelle) atteint le repère « Aoû » pile au 1er août.
  const _paceSpan=hasARE?Math.max(1,winEnd.getTime()-winStart.getTime()):1;
  const paceMarks:{frac:number,label:string}[]=[];
  if(hasARE){
    paceMarks.push({frac:0,label:_monShort[winStart.getMonth()]});
    let _d=new Date(winStart.getFullYear(),winStart.getMonth()+1,1);
    while(_d.getTime()<winEnd.getTime()){ paceMarks.push({frac:(_d.getTime()-winStart.getTime())/_paceSpan,label:_monShort[_d.getMonth()]}); _d=new Date(_d.getFullYear(),_d.getMonth()+1,1); }
  }
  const paceTickFracs=paceMarks.slice(1).map(m=>m.frac);
  const paceLabelMarks:{frac:number,label:string}[]=[]; let _lastLF=-1;
  for(const mk of paceMarks){ if(mk.frac-_lastLF>=0.05){ paceLabelMarks.push(mk); _lastLF=mk.frac; } }
  useEffect(()=>{ setAreInput(areVerse[moisKey]?String(areVerse[moisKey]):''); setReelPage(0); setNetInputs({}); },[moisKey,areVerse]);
  // Missions d'intermittence qui touchent le mois affiché (pour la saisie du net réel par mission).
  const _mmS=new Date(current.getFullYear(),current.getMonth(),1).getTime();
  const _mmE=new Date(current.getFullYear(),current.getMonth()+1,0).getTime();
  const monthMissions=missions.filter((m:any)=>{ if((m.regime||'intermittence')==='general')return false; const s=new Date(m.mission_date+'T00:00:00').getTime(); const e=new Date((m.end_date||m.mission_date)+'T00:00:00').getTime(); return e>=_mmS && s<=_mmE; });
  // Regroupement PAR PRODUCTION : une prod = un seul virement en général, pas un par mission.
  const reelGroups=(()=>{
    const map=new Map<string,{prodKey:string;prod:string;missions:any[];brut:number}>();
    for(const m of monthMissions){
      const key=(m.production||'Sans production').toUpperCase().trim();
      let g=map.get(key);
      if(!g){ g={prodKey:key,prod:(m.production||'Sans production'),missions:[],brut:0}; map.set(key,g); }
      g.missions.push(m); g.brut+=Number(m.gross_amount||0);
    }
    return Array.from(map.values());
  })();
  const REEL_PER=7;
  const totalReelPages=Math.max(1,Math.ceil(reelGroups.length/REEL_PER));
  const visibleReel=reelGroups.slice(reelPage*REEL_PER,(reelPage+1)*REEL_PER);

  const ft=useMemo(()=>{
    const aj=(profil&&Number(profil.taux_journalier))||0;
    if(!aj)return null;
    const artiste=profil.annexe==='artiste';
    const coef=artiste?1.3:1.4, divJ=artiste?10:8;
    // Jours indemnisables du mois affiché. Le MOIS D'OUVERTURE des droits ne compte qu'À PARTIR
    // de la date ARE (ex : admission le 14/01 → 18 jours en janvier, pas 31). Les mois AVANT
    // l'ouverture ne sont pas indemnisables (0). Les mois suivants = mois plein.
    const _lastDay=new Date(current.getFullYear(),current.getMonth()+1,0).getDate();
    let daysInMonth=_lastDay;
    if(areDate){
      const _a=new Date(areDate+'T00:00:00');
      if(_a.getFullYear()===current.getFullYear()&&_a.getMonth()===current.getMonth()) daysInMonth=_lastDay-_a.getDate()+1;
      else if(new Date(current.getFullYear(),current.getMonth(),1)<new Date(_a.getFullYear(),_a.getMonth(),1)) daysInMonth=0;
    }
    const clamp=(v:number)=>Math.max(0,Math.min(daysInMonth,v));
    // Jours non indemnisables (formule officielle France Travail) : heures × coef / diviseur.
    // On garde une petite fourchette (±1 jour d'arrondi) pour rester une estimation honnête.
    const jniRaw=monthH*coef/divJ;
    const daysHaut=clamp(daysInMonth-Math.floor(jniRaw)); // moins de JNI → borne haute
    const daysBas=clamp(daysInMonth-Math.ceil(jniRaw));   // plus de JNI → borne basse
    // Plafond de cumul : salaire brut du mois + allocation ≤ 118 % du PMSS.
    const plafond=CONFIG.PMSS*CONFIG.PLAFOND_CUMUL;
    const daysPlafond=Math.max(0,Math.ceil((plafond-monthG)/aj));
    const dHaut=Math.min(daysHaut,daysPlafond), dBas=Math.min(daysBas,daysPlafond);
    const plafondActif=daysPlafond<daysHaut; // le plafond rabote l'allocation ce mois-ci
    const tax=(profil&&Number(profil.taux_impot))||0;
    const fNet=1-tax/100, showNet=tax>0;
    const basAvant=Math.round(aj*dBas), hautAvant=Math.round(aj*dHaut);
    const bas=Math.round(aj*dBas*fNet), haut=Math.round(aj*dHaut*fNet);
    return { bas, haut, basAvant, hautAvant, showNet, tax, plafondActif, coefTxt:artiste?'1,3':'1,4', divTxt:artiste?'10':'8', plafond:Math.round(plafond), totalBas:monthNetApres+bas, totalHaut:monthNetApres+haut };
  },[profil,monthH,monthG,current,monthNetApres,areDate]);
  const totalPages=Math.ceil(upcoming.length/6);
  const visibleM=useMemo(()=>upcoming.slice(missionPage*6,(missionPage+1)*6),[upcoming,missionPage]);

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  async function saveAreDate(d:Date){
    const isoStr=d.toISOString().slice(0,10);
    setAreDate(isoStr);
    setYearOffset(0); // on repart sur l'année d'intermittence en cours

    await AsyncStorage.setItem('intermitrack_are_date',isoStr);
    const { data:{ user } }=await supabase.auth.getUser();
    if(user) await supabase.from('profiles').upsert({id:user.id,are_date:isoStr},{onConflict:'id'});
  }

  // « Mettre à jour » : enregistre d'un coup tous les nets saisis + l'allocation du mois.
  // Corrige net_reel sur chaque mission (donc calendrier / missions aussi) et l'ARE du mois.
  const parseNet=(raw:string)=>String(raw).trim()===''?null:(Number(String(raw).replace(',','.'))||0);
  async function saveAllReal(){
    setSavingReal(true);
    try{
      const { data:{ user } }=await supabase.auth.getUser();
      // Répartit le net saisi par PRODUCTION sur ses missions, au prorata du brut de chacune.
      const updates:{id:string;net:number|null}[]=[];
      for(const g of reelGroups){
        const raw=netInputs[g.prodKey];
        if(raw===undefined) continue;                 // production non touchée
        const total=parseNet(raw);
        if(total===null){ for(const m of g.missions) updates.push({id:m.id,net:null}); continue; }
        const brutSum=g.missions.reduce((a:number,m:any)=>a+Number(m.gross_amount||0),0);
        for(const m of g.missions){
          const share=brutSum>0?Number(m.gross_amount||0)/brutSum:1/g.missions.length;
          updates.push({id:m.id,net:Math.round(total*share*100)/100});
        }
      }
      for(const u of updates){ const { error }=await supabase.from('missions').update({net_reel:u.net}).eq('id',u.id); if(error) throw error; }
      const av=areInput.trim()===''?0:Number(areInput.replace(',','.'))||0;
      if(user){
        const r = av===0
          ? await supabase.from('are_versements').delete().eq('user_id',user.id).eq('mois',moisKey)
          : await supabase.from('are_versements').upsert({user_id:user.id,mois:moisKey,montant:av},{onConflict:'user_id,mois'});
        if(r.error) throw r.error;
      }
      setMissions(prev=>prev.map((m:any)=>{ const u=updates.find(x=>x.id===m.id); return u?{...m,net_reel:u.net}:m; }));
      setAreVerse(prev=>{const n={...prev}; if(av===0)delete n[moisKey]; else n[moisKey]=av; return n;});
      setNetInputs({});
      showAlert('Enregistré','Tes montants réels du mois ont été mis à jour.');
    }catch(e:any){
      showAlert('Oups', 'L\'enregistrement n\'a pas pu aboutir. Vérifie ta connexion et réessaie dans un instant.');
    }finally{
      setSavingReal(false);
    }
  }

  // Réinitialise les montants réels du mois affiché (nets des missions + allocation).
  function resetReal(){
    showAlert('Réinitialiser ?','Cela efface les montants réels saisis pour ce mois (nets + allocation). Ton brut et tes missions ne changent pas.',[
      {text:'Annuler',style:'cancel'},
      {text:'Réinitialiser',style:'destructive',onPress:async()=>{
        setSavingReal(true);
        try{
          const { data:{ user } }=await supabase.auth.getUser();
          for(const m of monthMissions){ if(m.net_reel!=null){ const { error }=await supabase.from('missions').update({net_reel:null}).eq('id',m.id); if(error) throw error; } }
          if(user){ const { error }=await supabase.from('are_versements').delete().eq('user_id',user.id).eq('mois',moisKey); if(error) throw error; }
          const ids=new Set(monthMissions.map((m:any)=>m.id));
          setMissions(prev=>prev.map((mm:any)=> ids.has(mm.id) ? {...mm,net_reel:null} : mm));
          setAreVerse(prev=>{const n={...prev}; delete n[moisKey]; return n;});
          setNetInputs({}); setAreInput('');
        }catch(e:any){ showAlert('Oups','La réinitialisation n\'a pas pu aboutir. Réessaie.'); }
        finally{ setSavingReal(false); }
      }},
    ]);
  }

  return(
    <>
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      {/* Pas de backgroundColor : sans effet en edge-to-edge (barre transparente) et API dépréciée depuis Android 15
          → signalé par le Play Console. barStyle suffit pour la lisibilité des icônes système. */}
      <StatusBar barStyle={scheme==='dark'?'light-content':'dark-content'}/>

      <View style={s.header}>
        <View style={s.headerBrand}>
          <Image source={require('../../assets/images/icon.png')} style={s.logoBox} resizeMode="cover" />
          <View>
            <Text style={s.brandName}>Intermitrack</Text>
            <Text style={s.brandTag}>Le tableau de bord des intermittents.</Text>
          </View>
        </View>
      </View>

      <View style={s.badgesRow}>
        <View style={[s.badge,{borderLeftColor:C.petrol}]}>
          <Text style={s.badgeVal}>{doneH}h</Text>
          <Text style={s.badgeLbl}>Heures effectuées</Text>
        </View>
        <View style={[s.badge,{borderLeftColor:C.orange}]}>
          <Text style={[s.badgeVal,{color:C.orange}]}>{planH}h</Text>
          <Text style={s.badgeLbl}>Heures prévues</Text>
        </View>
        <View style={[s.badge,{borderLeftColor:C.muted}]}>
          <Text style={[s.badgeVal,{color:C.muted}]}>{remaining}h</Text>
          <Text style={s.badgeLbl}>Heures restantes</Text>
        </View>
      </View>

      {clauseRattrapage && (
        <View style={{backgroundColor:'#FFF7ED',borderWidth:1,borderColor:'#FDBA74',borderRadius:14,padding:14,marginBottom:12}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:6}}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#EA580C"/>
            <Text style={{fontSize:12.5,fontWeight:'800',color:'#9A3412',textTransform:'uppercase',letterSpacing:0.4}}>Clause de rattrapage</Text>
          </View>
          <Text style={{fontSize:13.5,color:'#7C2D12',lineHeight:19}}>Il te reste <Text style={{fontWeight:'900'}}>{remaining} h</Text> pour atteindre 507 h et sécuriser tes droits.</Text>
          {clauseDeadline && (
            <Text style={{fontSize:13,color:'#7C2D12',lineHeight:19,marginTop:4}}>Échéance : <Text style={{fontWeight:'800'}}>{isoToDisplay(iso(clauseDeadline))}</Text>{clauseDaysLeft!=null?(clauseDaysLeft>0?` · ${clauseDaysLeft} jour${clauseDaysLeft>1?'s':''} restant${clauseDaysLeft>1?'s':''}`:' · délai dépassé'):''}</Text>
          )}
          <Text style={{fontSize:11.5,color:'#B45309',lineHeight:16,marginTop:6}}>Si tu atteins 507 h avant l'échéance, tes droits sont régularisés depuis ta date anniversaire.{!hasARE?' Renseigne ta date d\'admission ARE ci-dessous pour activer le compte à rebours.':''}</Text>
        </View>
      )}
      <View style={s.areBox}>
        <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="calendar-outline" size={13} color={C.petrol} /><Text style={s.areLabel}>Date d'admission ARE</Text></View>
        <TouchableOpacity style={s.arePickerBtn} onPress={()=>setShowDatePicker(true)}>
          <Text style={areDate?s.arePickerTxt:s.arePickerPlaceholder}>
            {areDate?isoToDisplay(areDate):'Choisir une date'}
          </Text>
          <Ionicons name="calendar-outline" size={16} color={C.petrol} />
        </TouchableOpacity>
        {hasARE
          ?<View style={s.aiNav}>
              <TouchableOpacity style={s.aiNavBtn} onPress={()=>setYearOffset(o=>o-1)}><Ionicons name="chevron-back" size={18} color={C.petrol}/></TouchableOpacity>
              <View style={{flex:1,alignItems:'center'}}>
                <Text style={s.aiPeriod}>{isoToDisplay(iso(winStart))} → {isoToDisplay(iso(winEnd))}</Text>
                <Text style={s.aiPeriodSub}>{yearOffset===0?'Année d\'intermittence en cours':(yearOffset===-1?'Année précédente':'Il y a '+(-yearOffset)+' ans')}</Text>
              </View>
              <TouchableOpacity style={[s.aiNavBtn,yearOffset>=0?{opacity:0.25}:null]} disabled={yearOffset>=0} onPress={()=>setYearOffset(o=>Math.min(0,o+1))}><Ionicons name="chevron-forward" size={18} color={C.petrol}/></TouchableOpacity>
            </View>
          :<Text style={s.areInfo}>Renseignez votre date pour un calcul précis</Text>
        }
        {showDatePicker&&(
          <>
          <DateTimePicker
            value={areDate?new Date(areDate):new Date()}
            mode="date" locale="fr-FR"
            themeVariant={scheme}
            display={Platform.OS==='ios'?'spinner':'default'}
            onChange={(e:any,date?:Date)=>{
              if(Platform.OS==='android'){
                setShowDatePicker(false);
                if(e.type==='set'&&date) saveAreDate(date);
              } else if(date){
                // iOS : on met juste à jour l'aperçu ; la sauvegarde se fait au bouton "Valider".
                setAreDate(date.toISOString().slice(0,10));
              }
            }}
          />
          {Platform.OS==='ios'&&(
            <TouchableOpacity style={s.areValidateBtn} onPress={()=>{ setShowDatePicker(false); saveAreDate(areDate?new Date(areDate):new Date()); }}>
              <Text style={s.areValidateTxt}>Valider la date</Text>
            </TouchableOpacity>
          )}
          </>
        )}
      </View>

      <View style={s.chartCard}>
        <Gauge done={doneH} planned={planH} total={507} formation={formH} enseignement={ensH}/>
        {hasARE&&(
          <View style={s.paceBox}>
            <View style={s.paceHead}>
              <Text style={s.paceHeadLbl}>Année d'intermittence</Text>
            </View>
            <View style={s.paceMonthsRow}>
              {paceLabelMarks.map((mk,i)=>(<Text key={i} style={[s.paceMonth,{left:`${Math.min(94,mk.frac*100)}%`}]}>{mk.label}</Text>))}
            </View>
            <View style={s.paceTrack}>
              <View style={[s.paceFill,{width:`${Math.round(elapsedFrac*100)}%`,backgroundColor:paceColor}]}/>
              {paceTickFracs.map((f,i)=>(<View key={i} style={[s.paceTick,{left:`${f*100}%`}]}/>))}
            </View>
            <Text style={s.paceStatus}>{Math.round(elapsedFrac*100)}% de l'année écoulée · <Text style={{color:paceColor}}>{paceLabel}</Text></Text>
          </View>
        )}
        {formRaw>0&&(
          <View style={s.formNote}>
            <Ionicons name="school-outline" size={14} color="#7C3AED"/>
            <Text style={s.formNoteTxt}>Formation comptée : <Text style={{fontWeight:'800',color:C.text}}>{formH} h / {FORM_CAP} h max</Text>{formRaw>FORM_CAP?` (${formRaw} h saisies, plafonnées)`:''}. Uniquement si tu n'es pas indemnisé pendant la formation.</Text>
          </View>
        )}
        {ensRaw>0&&(
          <View style={s.formNote}>
            <Ionicons name="easel-outline" size={14} color="#0EA5E9"/>
            <Text style={s.formNoteTxt}>Enseignement compté : <Text style={{fontWeight:'800',color:C.text}}>{ensH} h</Text>{ensRaw>ensH?` (${ensRaw} h saisies, plafonnées)`:''}. Plafond 70 h — 120 h à partir de 50 ans. Ce plafond est partagé avec la formation ({FORM_CAP} h au total).</Text>
          </View>
        )}
      </View>

      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Récap du mois</Text>
          <View style={s.monthNav}>
            <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(-1)}>
              <Text style={s.navBtnTxt}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>{setPickerYear(current.getFullYear());setShowMonthPicker(true);}}>
              <Text style={s.monthLbl}>{monthLabel(current)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(1)}>
              <Text style={s.navBtnTxt}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.statsGrid}>
          <View style={s.statBox}><Text style={s.statVal}>{monthHi}h</Text><Text style={s.statLbl}>Heures</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{money((taxRate>0||calibrated)?monthNetApres:monthNetAvant)}</Text><Text style={s.statSub}>Brut {money(monthGi)}{(taxRate>0||calibrated)?` · net ${money(monthNetAvant)}`:''}</Text><Text style={s.statLbl}>{(taxRate>0||calibrated)?'Net après impôt (est.)':'Net à payer (est.)'}</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{monthVac}</Text><Text style={s.statLbl}>Vacations</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{money(monthRateNet)}/h</Text><Text style={s.statSub}>Brut {money(monthRate)}/h{(taxRate>0||calibrated)?` · net ${money(monthRateNetAvant)}/h`:''}</Text><Text style={s.statLbl}>{(taxRate>0||calibrated)?'€/h après impôt (est.)':'Moyenne €/h (net est.)'}</Text></View>
        </View>
        {calibrated&&(
          <Text style={s.calibNote}>Net estimé ajusté d'après tes montants réels : tu encaisses ≈ {Math.round((learnedRatio||0)*100)} % du brut.</Text>
        )}
        {(regGenCount>0 || monthFormH>0) && (
          <View style={[s.statsGrid,{marginTop:8}]}>
            {regGenCount>0 && (
              <View style={s.statBox}><Text style={s.statVal}>{regGenH}h</Text><Text style={s.statSub}>{regGenCount} déclaration{regGenCount>1?'s':''}</Text><Text style={s.statLbl}>Régime général</Text></View>
            )}
            {monthFormH>0 && (
              <View style={s.statBox}><Text style={s.statVal}>{monthFormH}h</Text><Text style={s.statLbl}>Formation</Text></View>
            )}
          </View>
        )}
      </View>

      <View style={s.section}>
        {ft===null
          ?(
            <View style={s.ftCard}>
              <View style={{flexDirection:'row',alignItems:'flex-start',gap:5}}><Ionicons name="cash-outline" size={13} color={C.petrol} /><Text style={s.ftDetail}>Estimation France Travail — renseigne ton taux journalier (AJ) dans Mes informations.</Text></View>
              <TouchableOpacity style={s.ftBtn} onPress={()=>openMesInfos()}>
                <Text style={s.ftBtnTxt}>Renseigner mes infos</Text>
              </TouchableOpacity>
            </View>
          )
          :(
            <View style={s.ftCard}>
              <View style={s.ftHead}>
                <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="cash-outline" size={13} color={C.petrol} /><Text style={s.ftLabel}>Estimation France Travail (ce mois)</Text></View>
                <Text style={s.ftVal}>{ft.bas===ft.haut?`≈ ${money(ft.haut)}`:`≈ ${ft.bas.toLocaleString('fr-FR')} – ${money(ft.haut)}`}</Text>
              </View>
              <Text style={s.ftDetail}>{ft.showNet?`avant impôt ≈ ${ft.basAvant===ft.hautAvant?money(ft.hautAvant):`${ft.basAvant.toLocaleString('fr-FR')} – ${money(ft.hautAvant)}`} · après ${ft.tax} % d'impôt`:'fourchette brute'} · sur {monthH} h</Text>
              {ft.plafondActif&&(
                <View style={{flexDirection:'row',alignItems:'flex-start',gap:5,marginTop:6}}>
                  <Ionicons name="information-circle-outline" size={13} color={C.orange} style={{marginTop:1}} />
                  <Text style={[s.ftDetail,{color:C.orange,flex:1}]}>Plafond de cumul atteint : salaire + allocation limités à 118 % du PMSS ({money(ft.plafond)}) → allocation réduite ce mois-ci.</Text>
                </View>
              )}
              <View style={s.ftTotal}>
                <View style={s.ftTotalRow}>
                  <Text style={s.ftTotalLabel}>Revenu total estimé ce mois</Text>
                  <Text style={s.ftTotalVal}>{ft.totalBas===ft.totalHaut?`≈ ${money(ft.totalHaut)}`:`≈ ${ft.totalBas.toLocaleString('fr-FR')} – ${money(ft.totalHaut)}`}</Text>
                </View>
                <Text style={s.ftTotalSub}>salaire net {money(monthNetApres)} + allocation France Travail</Text>
              </View>
              <View style={s.ftFormula}>
                <Text style={s.ftFormulaTitle}>Comment on calcule (annexe {ft.divTxt==='8'?'8 · technicien':'10 · artiste'})</Text>
                <Text style={s.ftFormulaLine}>• Jours non indemnisables = heures × {ft.coefTxt} ÷ {ft.divTxt}</Text>
                <Text style={s.ftFormulaLine}>• Jours indemnisés = jours du mois − jours non indemnisables</Text>
                <Text style={s.ftFormulaLine}>• Allocation = AJ × jours indemnisés</Text>
                <Text style={s.ftFormulaLine}>• Plafond : salaire + allocation ≤ 118 % du PMSS ({money(ft.plafond)})</Text>
              </View>
              <Text style={s.ftNote}>Fourchette estimative. Ne tient pas encore compte des carences / franchises de début de droits. Nos calculs sont en cours d'optimisation pour se rapprocher au plus près du montant réel. Montant exact : ton espace France Travail.</Text>
            </View>
          )
        }
      </View>

      <View style={s.section}>
        <View style={s.reelBox}>
          <View style={s.reelHead}>
            <Ionicons name="wallet-outline" size={14} color={C.petrol}/>
            <Text style={s.reelTitle}>Montants réels du mois</Text>
          </View>
          <Text style={s.reelIntro}>Renseigne le net (une fois payé) et l'allocation reçue, puis appuie sur « Mettre à jour » : tu auras le total exact du mois.</Text>
          {reelGroups.length>0 ? visibleReel.map((g:any)=>{
            const saved=g.missions.reduce((a:number,m:any)=>a+(m.net_reel!=null?Number(m.net_reel):0),0);
            const hasNet=g.missions.some((m:any)=>m.net_reel!=null);
            const val=netInputs[g.prodKey]!==undefined?netInputs[g.prodKey]:(hasNet?String(Math.round(saved*100)/100):'');
            return (
              <View key={g.prodKey} style={s.reelRow}>
                <View style={{flex:1}}>
                  <Text style={s.reelProd} numberOfLines={1}>{g.prod}</Text>
                  <Text style={s.reelBrut}>brut {money(Math.round(g.brut))}{g.missions.length>1?` · ${g.missions.length} missions`:''}</Text>
                </View>
                <NumInput
                  style={s.reelInput}
                  value={val}
                  onChangeText={(t:string)=>setNetInputs(p=>({...p,[g.prodKey]:t}))}
                  placeholder="net €" placeholderTextColor={C.muted}
                />
              </View>
            );
          }) : <Text style={s.reelEmpty}>Aucune mission ce mois-ci.</Text>}
          {totalReelPages>1&&(
            <View style={s.reelPager}>
              <TouchableOpacity style={[s.navBtn,reelPage<=0&&{opacity:0.3}]} disabled={reelPage<=0} onPress={()=>setReelPage(p=>Math.max(0,p-1))}><Text style={s.navBtnTxt}>‹</Text></TouchableOpacity>
              <Text style={s.pageInfo}>Page {reelPage+1}/{totalReelPages}</Text>
              <TouchableOpacity style={[s.navBtn,reelPage>=totalReelPages-1&&{opacity:0.3}]} disabled={reelPage>=totalReelPages-1} onPress={()=>setReelPage(p=>Math.min(totalReelPages-1,p+1))}><Text style={s.navBtnTxt}>›</Text></TouchableOpacity>
            </View>
          )}
          <View style={s.reelRow}>
            <Text style={[s.reelProd,{flex:1}]}>Allocation France Travail versée</Text>
            <NumInput style={s.reelInput} value={areInput} onChangeText={setAreInput} placeholder="ARE €" placeholderTextColor={C.muted}/>
          </View>
          <TouchableOpacity style={[s.reelSaveBtn,savingReal&&{opacity:0.6}]} onPress={saveAllReal} disabled={savingReal}>
            <Text style={s.reelSaveTxt}>{savingReal?'Enregistrement…':'Mettre à jour'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.reelResetBtn} onPress={resetReal} disabled={savingReal}>
            <Text style={s.reelResetTxt}>Réinitialiser les montants du mois</Text>
          </TouchableOpacity>
          {hasReel&&(
            <View style={s.reelTotal}>
              <Text style={s.reelTotalLbl}>Total réel du mois</Text>
              <Text style={s.reelTotalVal}>{money(totalReelMonth)}</Text>
            </View>
          )}
          {hasReel&&<Text style={s.reelSub}>net réel {money(monthNetReel)} + allocation versée {money(areVerseMonth)}</Text>}
        </View>
      </View>

      {/* « Missions à venir » retiré du dashboard (redondant avec la liste sous le calendrier
          et l'onglet Missions). La prochaine mission se retrouve désormais en tête de
          « Mes missions du mois » sous le calendrier. */}

      <Modal visible={!!editId} animationType="slide" transparent onRequestClose={()=>setEditId(null)}>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Modifier la mission</Text>

              {/* Un appui ouvre le POP-UP listant toutes les productions, de la plus utilisée à la moins
                  utilisée : choix direct ou création. Même composant que le calendrier et les missions. */}
              <Text style={s.label}>Nom de la production</Text>
              <TouchableOpacity style={s.typeBtn} onPress={()=>setShowProdPicker(true)}>
                <Text style={[s.typeBtnTxt,!fProduction&&{color:C.muted,fontWeight:'400'}]} numberOfLines={1}>{fProduction||'Choisir ou créer…'}</Text>
                <Text style={s.typeBtnChevron}>▾</Text>
              </TouchableOpacity>
              <ProductionPickerModal
                visible={showProdPicker}
                productions={knownProductions}
                current={fProduction}
                onPick={(p)=>{setFProduction(p);setShowProdPicker(false);}}
                onClose={()=>setShowProdPicker(false)}
              />

              <Text style={s.label}>Nom de l'émission (facultatif)</Text>
              <TxtInput style={s.input} value={fEmission} onChangeText={setFEmission} placeholder="Ex : Koh-Lanta" placeholderTextColor={C.muted}/>

              <Text style={s.label}>Type de mission</Text>
              <TouchableOpacity style={s.typeBtn} onPress={()=>{setTypeAddMode(false);setShowTypePicker(v=>!v);}}>
                <Text style={s.typeBtnTxt}>{fType}</Text>
                <Text style={s.typeBtnChevron}>{showTypePicker?'▴':'▾'}</Text>
              </TouchableOpacity>
              {/* Plusieurs types le meme jour pour le meme employeur (ex. « Rec + MIX »). Appui unique conserve
                  pour le cas courant, lien discret pour en cumuler un 2e. Idem calendrier / missions / site. */}
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
                  {/* Annuler : un appui par erreur sur « + Ajouter un type » ne doit pas obliger a choisir. */}
                  {typeAddMode && (
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}>
                      <Text style={[s.typeGroupLbl,{flexShrink:1}]} numberOfLines={1}>Ajouter un 2e type à « {fType} »</Text>
                      <TouchableOpacity onPress={()=>{setShowTypePicker(false);setTypeAddMode(false);}} hitSlop={8}>
                        <Text style={s.typeCancelTxt}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {([['Technique',POSTES_TECH],['Artiste',POSTES_ARTISTE],['Musique / scène',POSTES_MUSIQUE],['Autre',POSTES_AUTRE]] as [string,string[]][]).map(([grp,list])=>(
                    <View key={grp}>
                      <Text style={s.typeGroupLbl}>{grp}</Text>
                      <View style={s.typeWrap}>
                        {list.map(p=>(
                          <TouchableOpacity key={p} style={[s.typeChip,typeParts(fType).includes(p)&&s.typeChipActive]} onPress={()=>{setFType(typeAddMode?addType(fType,p):p);setShowTypePicker(false);setTypeAddMode(false);}}>
                            <Text style={typeParts(fType).includes(p)?s.typeChipTxtActive:s.typeChipTxt}>{p}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}
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
                <DateTimePicker value={fStart} mode="date" locale="fr-FR" themeVariant="light" display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowStartPicker(false);if(date){setFStart(date);if(date>fEnd)setFEnd(date);}}}/>
              )}
              {showEndPicker&&(
                <DateTimePicker value={fEnd} mode="date" locale="fr-FR" themeVariant="light" display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowEndPicker(false);if(date)setFEnd(date);}}/>
              )}

              <Text style={s.label}>Heures cumulées</Text>
              <NumInput style={s.input} value={fHours} onChangeText={setFHours}/>

              <Text style={s.label}>Nombre de vacations / cachets</Text>
              <NumInput style={s.input} value={fVacations} onChangeText={setFVacations} placeholder="Ex : 1" placeholderTextColor={C.muted}/>
              <Text style={{fontSize:11,color:C.muted,marginTop:4}}>1 vacation = 1 jour (technicien) · 1 cachet (artiste / musicien).</Text>

              <Text style={s.label}>Montant brut (€)</Text>
              <NumInput style={s.input} value={fGross} onChangeText={setFGross}/>

              <KmSection key={editId} ref={kmRef} nbDays={Math.max(1, Math.min(Math.round((fEnd.getTime() - fStart.getTime()) / 86400000) + 1, Math.round((Number(fHours) || 0) / 8)))} initialDistance={editKmDist} initialRate={editKmRate} />

              <GradientButton onPress={saveEdit} disabled={saving} style={s.saveBtn} textStyle={s.saveBtnTxt} label={saving?'Enregistrement…':'Mettre à jour'} />
              <TouchableOpacity style={s.deleteBtn} onPress={deleteEdit}>
                <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Ionicons name="trash-outline" size={15} color="#E53E3E"/><Text style={s.deleteBtnTxt}>Supprimer cette mission</Text></View>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setEditId(null)}>
                <Text style={s.cancelBtnTxt}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {showMonthPicker&&(
        <View style={mp.overlay}>
          <View style={mp.modal}>
            <Text style={mp.title}>Choisir un mois</Text>
            <View style={mp.yearRow}>
              <TouchableOpacity style={mp.yearBtn} onPress={()=>setPickerYear(y=>y-1)}>
                <Text style={mp.yearBtnTxt}>‹</Text>
              </TouchableOpacity>
              <Text style={mp.yearLbl}>{pickerYear}</Text>
              <TouchableOpacity style={mp.yearBtn} onPress={()=>setPickerYear(y=>y+1)}>
                <Text style={mp.yearBtnTxt}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={mp.grid}>
              {['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'].map((m,i)=>{
                const isActive=current.getMonth()===i&&current.getFullYear()===pickerYear;
                return(
                  <TouchableOpacity key={i} style={[mp.monthBtn,isActive&&mp.monthBtnActive]}
                    onPress={()=>{setCurrent(new Date(pickerYear,i,1));setShowMonthPicker(false);}}>
                    <Text style={[mp.monthTxt,isActive&&mp.monthTxtActive]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={mp.closeBtn} onPress={()=>setShowMonthPicker(false)}>
              <Text style={mp.closeBtnTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
    </>
  );
}

const makeMp=(C:any)=>StyleSheet.create({
  overlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'center',alignItems:'center',zIndex:999},
  modal:{backgroundColor:C.card,borderRadius:22,padding:22,width:'85%'},
  title:{fontSize:17,fontWeight:'900',color:C.petrol,textAlign:'center',marginBottom:16},
  yearRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:20,marginBottom:16},
  yearBtn:{width:36,height:36,borderRadius:18,backgroundColor:C.soft,justifyContent:'center',alignItems:'center'},
  yearBtnTxt:{fontSize:18,fontWeight:'900',color:C.petrol},
  yearLbl:{fontSize:20,fontWeight:'900',color:C.petrol,minWidth:60,textAlign:'center'},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16},
  monthBtn:{width:'30%',paddingVertical:10,borderRadius:12,backgroundColor:C.soft,alignItems:'center'},
  monthBtnActive:{backgroundColor:C.petrol},
  monthTxt:{fontSize:13,fontWeight:'700',color:C.petrol},
  monthTxtActive:{color:'#FFFFFF'},
  closeBtn:{backgroundColor:C.soft,borderRadius:12,paddingVertical:12,alignItems:'center'},
  closeBtnTxt:{fontSize:14,fontWeight:'800',color:C.petrol},
});

const makeS=(C:any)=>StyleSheet.create({
  container:{flex:1,backgroundColor:'transparent'},
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg},
  logoBox:{width:46,height:46,borderRadius:14,backgroundColor:C.petrol,justifyContent:'center',alignItems:'center'},
  logoTxt:{color:'white',fontWeight:'800',fontSize:22},
  header:{backgroundColor:C.card,flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:18,paddingTop:52,paddingBottom:14,borderBottomWidth:1,borderBottomColor:C.line},
  headerBrand:{flexDirection:'row',alignItems:'center',gap:12},
  brandName:{fontSize:20,fontWeight:'800',color:C.petrol,letterSpacing:-0.5},
  brandTag:{fontSize:12,color:C.muted,marginTop:1},
  avatarBtn:{width:40,height:40,borderRadius:20,backgroundColor:C.petrol,justifyContent:'center',alignItems:'center'},
  avatarTxt:{color:'white',fontWeight:'900',fontSize:14},
  badgesRow:{flexDirection:'row',gap:12,padding:16},
  badge:{flex:1,backgroundColor:C.card,borderRadius:16,padding:14,borderWidth:1,borderColor:C.line,borderLeftWidth:4,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:8,elevation:2},
  badgeVal:{fontSize:20,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  badgeLbl:{fontSize:11,color:C.muted,fontWeight:'700',marginTop:4},
  areBox:{marginHorizontal:16,backgroundColor:C.card,borderRadius:16,padding:14,borderWidth:1,borderColor:C.line},
  areLabel:{fontSize:11,fontWeight:'900',color:C.petrol,marginBottom:8,textTransform:'uppercase',letterSpacing:0.5},
  arePickerBtn:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:C.line,borderRadius:12,paddingVertical:12,paddingHorizontal:14,backgroundColor:C.soft},
  arePickerTxt:{fontSize:15,fontWeight:'700',color:C.petrol},
  arePickerPlaceholder:{fontSize:15,color:C.muted},
  arePickerIcon:{fontSize:16},
  areInfo:{fontSize:11,color:C.muted,marginTop:6,fontStyle:'italic'},
  aiNav:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},
  aiNavBtn:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:C.soft},
  aiPeriod:{fontSize:13.5,fontWeight:'900',color:C.petrol},
  aiPeriodSub:{fontSize:10.5,color:C.muted,marginTop:1,fontWeight:'700'},
  areValidateBtn:{backgroundColor:C.petrol,borderRadius:12,paddingVertical:13,alignItems:'center',marginTop:10},
  areValidateTxt:{color:'#FFFFFF',fontWeight:'800',fontSize:15},
  chartCard:{marginHorizontal:16,backgroundColor:C.card,borderRadius:22,padding:4,borderWidth:1,borderColor:C.line,marginTop:12,shadowColor:C.petrol,shadowOpacity:0.06,shadowRadius:16,elevation:3},
  formNote:{flexDirection:'row',alignItems:'flex-start',gap:6,marginHorizontal:10,marginTop:2,marginBottom:10,padding:10,borderRadius:12,backgroundColor:C.soft},
  formNoteTxt:{flex:1,fontSize:11.5,lineHeight:16,color:C.muted},
  section:{marginHorizontal:16,marginTop:16},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  quickBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:12,marginBottom:12,borderRadius:13,borderWidth:1.5,borderStyle:'dashed',borderColor:C.green,backgroundColor:C.greenBg},
  quickBtnTxt:{fontSize:14,fontWeight:'800',color:C.green},
  sectionTitle:{fontSize:17,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  monthNav:{flexDirection:'row',alignItems:'center',gap:8},
  navBtn:{width:34,height:34,borderRadius:17,backgroundColor:C.soft,justifyContent:'center',alignItems:'center'},
  navBtnTxt:{fontSize:18,fontWeight:'900',color:C.petrol,lineHeight:20},
  monthLbl:{fontSize:13,fontWeight:'800',color:C.petrol,minWidth:110,textAlign:'center'},
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  statBox:{width:'47%',backgroundColor:C.card,borderRadius:14,padding:14,alignItems:'center',borderWidth:1,borderColor:C.line,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:6,elevation:2},
  statVal:{fontSize:17,fontWeight:'900',color:C.petrol},
  statSub:{fontSize:10,color:C.muted,fontWeight:'700',marginTop:1},
  statLbl:{fontSize:10,color:C.muted,fontWeight:'700',marginTop:3,textTransform:'uppercase'},
  calibNote:{fontSize:10.5,color:C.muted,fontStyle:'italic',marginTop:8,textAlign:'center',lineHeight:15},
  empty:{textAlign:'center',color:C.muted,padding:20},
  missionCard:{backgroundColor:C.card,borderRadius:16,padding:14,marginBottom:10,borderWidth:1,borderColor:'rgba(31,78,95,0.12)',borderLeftWidth:4,borderLeftColor:C.petrol,shadowColor:C.petrol,shadowOpacity:0.05,shadowRadius:8,elevation:2},
  missionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:8},
  missionProd:{fontSize:14,fontWeight:'900',color:C.petrol,flex:1,textTransform:'uppercase'},
  pill:{backgroundColor:C.soft,borderRadius:99,paddingHorizontal:9,paddingVertical:4},
  pillTxt:{fontSize:10,fontWeight:'700',color:C.petrol},
  missionInfo:{gap:4},
  meta:{fontSize:12,fontWeight:'600',color:C.text},
  pagination:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:16,marginTop:8,marginBottom:8},
  pageInfo:{fontSize:12,fontWeight:'900',color:C.petrol},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'flex-end'},
  modalCard:{backgroundColor:C.bg,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'90%'},
  modalTitle:{fontSize:20,fontWeight:'900',color:C.petrol,marginBottom:12,textAlign:'center'},
  label:{fontSize:13,fontWeight:'700',color:C.text,marginTop:12,marginBottom:6},
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:13,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:C.card},
  inputTxt:{fontSize:15,color:C.text},
  row:{flexDirection:'row',gap:10},
  typeWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  typeChip:{paddingVertical:9,paddingHorizontal:14,borderRadius:99,backgroundColor:C.soft},
  typeChipActive:{backgroundColor:C.petrol},
  typeChipTxt:{fontSize:13,fontWeight:'700',color:C.petrol},
  typeChipTxtActive:{fontSize:13,fontWeight:'700',color:'white'},
  typeBtn:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:12,paddingHorizontal:14,borderRadius:12,backgroundColor:C.card,borderWidth:1,borderColor:C.line},
  // Lien discret « + Ajouter un type de mission » : ne doit pas concurrencer le bouton principal.
  typeAddLink:{fontSize:12,fontWeight:'700',color:C.petrol,marginTop:8,textDecorationLine:'underline'},
  typeCancelTxt:{fontSize:12,fontWeight:'800',color:C.muted,textDecorationLine:'underline'},
  typeBtnTxt:{fontSize:14,fontWeight:'700',color:C.text},
  typeBtnChevron:{fontSize:13,color:C.muted},
  typeGroupLbl:{fontSize:11.5,fontWeight:'800',color:C.muted,marginTop:14,marginBottom:8,textTransform:'uppercase',letterSpacing:0.5},
  typePickerInline:{marginTop:8,padding:12,borderRadius:12,backgroundColor:C.soft,borderWidth:1,borderColor:C.line},
  saveBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:15,alignItems:'center',marginTop:20},
  saveBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  deleteBtn:{backgroundColor:'#FFF5F5',borderRadius:15,paddingVertical:14,alignItems:'center',marginTop:10},
  deleteBtnTxt:{color:'#E53E3E',fontWeight:'800',fontSize:14},
  cancelBtn:{paddingVertical:14,alignItems:'center',marginTop:4},
  cancelBtnTxt:{color:C.muted,fontWeight:'700',fontSize:14},
  accountOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'center',alignItems:'center'},
  accountCard:{backgroundColor:C.card,borderRadius:22,padding:22,width:'85%'},
  accountTitle:{fontSize:18,fontWeight:'900',color:C.petrol,textAlign:'center'},
  accountEmail:{fontSize:13,color:C.muted,textAlign:'center',marginTop:4,marginBottom:18},
  accountBtn:{backgroundColor:C.petrol,borderRadius:14,paddingVertical:14,alignItems:'center'},
  accountBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  accountReportBtn:{backgroundColor:C.soft,borderRadius:14,paddingVertical:14,alignItems:'center',marginTop:10},
  accountReportTxt:{color:C.petrol,fontWeight:'800',fontSize:15},
  accountDeleteBtn:{backgroundColor:'#FFF5F5',borderRadius:14,paddingVertical:14,alignItems:'center',marginTop:10},
  accountDeleteTxt:{color:'#E53E3E',fontWeight:'800',fontSize:14},
  accountCancel:{paddingVertical:14,alignItems:'center',marginTop:4},
  accountCancelTxt:{color:C.muted,fontWeight:'700',fontSize:14},
  legalRow:{flexDirection:'row',justifyContent:'center',alignItems:'center',flexWrap:'wrap',gap:6,marginTop:14},
  legalLink:{fontSize:11,color:C.muted,fontWeight:'700',textDecorationLine:'underline'},
  legalSep:{fontSize:11,color:C.muted},
  ftCard:{backgroundColor:'rgba(31,78,95,.05)',borderRadius:14,padding:14,borderWidth:1,borderColor:C.line},
  ftHead:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:6},
  ftLabel:{fontSize:12.5,fontWeight:'900',color:C.petrol},
  ftVal:{fontSize:20,fontWeight:'900',color:C.petrol,letterSpacing:-0.5,flexShrink:1,flexWrap:'wrap'},
  ftDetail:{fontSize:11.5,color:C.muted,fontWeight:'600',marginTop:6},
  ftTotal:{backgroundColor:'rgba(31,78,95,.09)',borderRadius:11,padding:11,marginTop:11},
  ftTotalRow:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:6},
  ftTotalLabel:{fontSize:12,fontWeight:'800',color:C.petrol},
  ftTotalVal:{fontSize:17,fontWeight:'900',color:C.petrol,flexShrink:1,flexWrap:'wrap'},
  ftTotalSub:{fontSize:11,color:C.muted,fontWeight:'600',marginTop:4},
  ftFormula:{backgroundColor:C.soft,borderRadius:11,padding:11,marginTop:11,gap:3},
  ftFormulaTitle:{fontSize:11,fontWeight:'900',color:C.petrol,textTransform:'uppercase',letterSpacing:0.3,marginBottom:2},
  ftFormulaLine:{fontSize:11,color:C.text,fontWeight:'600',lineHeight:16},
  ftNote:{fontSize:10,color:C.muted,lineHeight:15,marginTop:11},
  ftBtn:{backgroundColor:C.petrol,borderRadius:12,paddingVertical:12,alignItems:'center',marginTop:12},
  ftBtnTxt:{color:'white',fontWeight:'800',fontSize:14},
  paceBox:{marginHorizontal:10,marginTop:4,marginBottom:10,paddingVertical:12,paddingHorizontal:14,borderRadius:12,backgroundColor:C.soft},
  paceHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  paceHeadLbl:{fontSize:12,fontWeight:'700',color:C.text},
  paceHeadPct:{fontSize:16,fontWeight:'900'},
  paceMonthsRow:{height:12,position:'relative',marginBottom:3},
  paceMonth:{position:'absolute',fontSize:8.5,fontWeight:'700',color:C.muted},
  paceTrack:{height:12,borderRadius:6,backgroundColor:C.line,overflow:'hidden'},
  paceFill:{height:'100%',borderRadius:6},
  paceTick:{position:'absolute',top:0,bottom:0,width:1,backgroundColor:'rgba(45,55,72,0.18)'},
  paceStatus:{fontSize:10.5,fontWeight:'400',fontStyle:'italic',color:C.muted,marginTop:7},
  reelBox:{marginTop:12,backgroundColor:C.card,borderRadius:14,padding:14,borderWidth:1,borderColor:C.line,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:8,elevation:2},
  reelHead:{flexDirection:'row',alignItems:'center',gap:6},
  reelTitle:{fontSize:13,fontWeight:'900',color:C.petrol},
  reelIntro:{fontSize:11.5,color:C.muted,fontWeight:'600',marginTop:6,marginBottom:4,lineHeight:16},
  reelRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line},
  reelProd:{fontSize:13,fontWeight:'700',color:C.text},
  reelBrut:{fontSize:11,color:C.muted,fontWeight:'600',marginTop:1},
  reelInput:{width:98,borderWidth:1.5,borderColor:C.muted+'55',borderRadius:10,paddingVertical:9,paddingHorizontal:10,fontSize:14,color:C.text,backgroundColor:C.soft,textAlign:'right'},
  reelEmpty:{fontSize:12,color:C.muted,paddingVertical:8},
  reelTotal:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.line},
  reelTotalLbl:{fontSize:13,fontWeight:'800',color:C.petrol},
  reelTotalVal:{fontSize:17,fontWeight:'900',color:C.petrol},
  reelSub:{fontSize:11,color:C.muted,fontWeight:'600',marginTop:4},
  reelPager:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:14,paddingVertical:8},
  reelSaveBtn:{backgroundColor:C.petrol,borderRadius:12,paddingVertical:13,alignItems:'center',marginTop:12},
  reelSaveTxt:{color:'#fff',fontWeight:'800',fontSize:14},
  reelResetBtn:{alignItems:'center',paddingVertical:9,marginTop:4},
  reelResetTxt:{color:C.muted,fontWeight:'700',fontSize:13,textDecorationLine:'underline'},
});