import { showAlert } from "../../lib/dialog";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useTrackView } from '../../lib/analytics';
import { CONFIG } from '../../lib/calcul';
import Gauge from '../../components/Gauge';
import NumInput from '../../components/NumInput';
import KmSection, { KmHandle } from '../../components/KmSection';
import TxtInput from '../../components/TxtInput';
import { GradientButton } from '../../components/GradientButton';
import { openMesInfos, onProfilChanged } from '../../components/AccountMenu';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemeControls } from '../../lib/theme';

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
  const [loading,setLoading]=useState(true);
  const [missions,setMissions]=useState<any[]>([]);
  const [current,setCurrent]=useState(new Date());
  const [missionPage,setMissionPage]=useState(0);
  const [areDate,setAreDate]=useState('');
  const [chargeRate,setChargeRate]=useState(22.5); // % charges salariales (réglé dans Prévisions)
  const [pasRate,setPasRate]=useState(0);          // % prélèvement à la source
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
  const [fType,setFType]=useState('Montage');
  const [showTypePicker,setShowTypePicker]=useState(false);
  const [fVacations,setFVacations]=useState('');
  const [fStart,setFStart]=useState(new Date());
  const [fEnd,setFEnd]=useState(new Date());
  const [fHours,setFHours]=useState('');
  const [fGross,setFGross]=useState('');
  const [showStartPicker,setShowStartPicker]=useState(false);
  const [showEndPicker,setShowEndPicker]=useState(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{loadData();},[]);
  useFocusEffect(useCallback(()=>{loadData(true);},[]));
  // Rechargement immédiat quand on modifie « Mes informations » (annexe artiste/technicien, taux…) depuis la modale, qui ne change pas le focus de l'écran.
  useEffect(()=>onProfilChanged(()=>loadData(true)),[]);

  async function loadData(silent=false){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:true});
    if(data)setMissions(data);
    const saved=await AsyncStorage.getItem('intermitrack_are_date');
    if(saved)setAreDate(saved);
    const ch=await AsyncStorage.getItem('intermitrack_charge_rate');
    setChargeRate(ch!==null?Number(ch):22.5);
    const pas=await AsyncStorage.getItem('intermitrack_pas_rate');
    setPasRate(pas!==null?Number(pas):0);
    const { data:{ user } }=await supabase.auth.getUser();
    if(user){
      const { data:prof }=await supabase.from('profiles').select('annexe,droits_ouverts,taux_journalier,taux_impot,are_date').eq('id',user.id).maybeSingle();
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
    setFProduction(m.production||''); setFEmission(m.emission||''); setFType(m.mission_type||'Montage');
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

  const stats=useMemo(()=>{
    const today=new Date();today.setHours(0,0,0,0);
    const areStart=areDate?new Date(areDate+'T00:00:00'):null;
    const yearM=areStart?missions.filter((m:any)=>new Date(m.mission_date+'T00:00:00')>=areStart):missions;
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
    const doneH=Math.round(yearM.reduce((a:number,m:any)=>a+splitT(m).done,0)*10)/10;
    const planH=Math.round(yearM.reduce((a:number,m:any)=>a+splitT(m).planned,0)*10)/10;
    const remaining=Math.max(0,Math.round((507-doneH-planH)*10)/10);
    const monthM=missions.filter((m:any)=>{const d=new Date(m.mission_date+'T00:00:00');return d.getMonth()===current.getMonth()&&d.getFullYear()===current.getFullYear();});
    const monthH=Math.round(monthM.reduce((a:number,m:any)=>a+Number(m.hours||0),0)*10)/10;
    const monthG=monthM.reduce((a:number,m:any)=>a+Number(m.gross_amount||0),0);
    const monthVac=monthM.reduce((a:number,m:any)=>a+Math.max(1,Math.round((new Date((m.end_date||m.mission_date)+'T00:00:00').getTime()-new Date(m.mission_date+'T00:00:00').getTime())/86400000)+1),0); // 1 vacation = 1 jour de mission
    const monthRate=monthH>0?Math.round(monthG/monthH):0;
    // Net à payer estimé = brut − charges salariales − prélèvement à la source
    const monthNet=Math.round(monthG*(1-chargeRate/100)*(1-pasRate/100));
    const monthRateNet=monthH>0?Math.round(monthNet/monthH):0;
    return { doneH, planH, remaining, monthH, monthG, monthNet, monthVac, monthRate, monthRateNet, upcoming };
  },[missions,areDate,current,chargeRate,pasRate]);

  const { doneH, planH, remaining, monthH, monthG, monthNet, monthVac, monthRate, monthRateNet, upcoming } = stats;

  const ft=useMemo(()=>{
    const aj=(profil&&Number(profil.taux_journalier))||0;
    if(!aj)return null;
    const artiste=profil.annexe==='artiste';
    const coef=artiste?1.3:1.4, divJ=artiste?10:8;
    const daysInMonth=new Date(current.getFullYear(),current.getMonth()+1,0).getDate();
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
    const bas=Math.round(aj*dBas*fNet), haut=Math.round(aj*dHaut*fNet);
    return { bas, haut, showNet, tax, plafondActif, coefTxt:artiste?'1,3':'1,4', divTxt:artiste?'10':'8', plafond:Math.round(plafond), totalBas:monthNet+bas, totalHaut:monthNet+haut };
  },[profil,monthH,monthG,current,monthNet]);
  const totalPages=Math.ceil(upcoming.length/6);
  const visibleM=useMemo(()=>upcoming.slice(missionPage*6,(missionPage+1)*6),[upcoming,missionPage]);

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  async function saveAreDate(d:Date){
    const isoStr=d.toISOString().slice(0,10);
    setAreDate(isoStr);
    await AsyncStorage.setItem('intermitrack_are_date',isoStr);
    const { data:{ user } }=await supabase.auth.getUser();
    if(user) await supabase.from('profiles').upsert({id:user.id,are_date:isoStr},{onConflict:'id'});
  }

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <StatusBar barStyle={scheme==='dark'?'light-content':'dark-content'} backgroundColor={C.card}/>

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

      <View style={s.areBox}>
        <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="calendar-outline" size={13} color={C.petrol} /><Text style={s.areLabel}>Date d'admission ARE</Text></View>
        <TouchableOpacity style={s.arePickerBtn} onPress={()=>setShowDatePicker(true)}>
          <Text style={areDate?s.arePickerTxt:s.arePickerPlaceholder}>
            {areDate?isoToDisplay(areDate):'Choisir une date'}
          </Text>
          <Ionicons name="calendar-outline" size={16} color={C.petrol} />
        </TouchableOpacity>
        {areDate
          ?<Text style={s.areInfo}>Calcul depuis le {isoToDisplay(areDate)}</Text>
          :<Text style={s.areInfo}>Renseignez votre date pour un calcul précis</Text>
        }
        {showDatePicker&&(
          <>
          <DateTimePicker
            value={areDate?new Date(areDate):new Date()}
            mode="date"
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
        <Gauge done={doneH} planned={planH} total={507}/>
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
          <View style={s.statBox}><Text style={s.statVal}>{monthH}h</Text><Text style={s.statLbl}>Heures</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{money(monthNet)}</Text><Text style={s.statSub}>Brut {money(monthG)}</Text><Text style={s.statLbl}>Net à payer (est.)</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{monthVac}</Text><Text style={s.statLbl}>Vacations</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{money(monthRateNet)}/h</Text><Text style={s.statSub}>Brut {money(monthRate)}/h</Text><Text style={s.statLbl}>Moyenne €/h (net est.)</Text></View>
        </View>
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
              <Text style={s.ftDetail}>{ft.showNet?`fourchette nette (après ${ft.tax} % d'impôt)`:'fourchette brute'} · sur {monthH} h</Text>
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
                <Text style={s.ftTotalSub}>salaire net {money(monthNet)} + allocation France Travail</Text>
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
        <Text style={s.sectionTitle}>Missions à venir</Text>
        {upcoming.length===0
          ?<Text style={s.empty}>Aucune mission à venir.</Text>
          :<>
            {visibleM.map((m:any)=>(
              <TouchableOpacity key={m.id} style={s.missionCard} onPress={()=>openEdit(m)}>
                <View style={s.missionHead}>
                  <Text style={s.missionProd} numberOfLines={1}>{m.production}</Text>
                  <View style={s.pill}><Text style={s.pillTxt}>{m.mission_type}</Text></View>
                </View>
                <View style={s.missionInfo}>
                  {m.emission?<View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="videocam-outline" size={13} color={C.muted} /><Text style={s.meta}>{m.emission}</Text></View>:null}
                  <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="calendar-outline" size={13} color={C.muted} /><Text style={s.meta}>{fmtPeriod(m.mission_date,m.end_date)}</Text></View>
                  <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="time-outline" size={13} color={C.muted} /><Text style={s.meta}>{m.hours}h · {money(m.gross_amount)}</Text></View>
                </View>
              </TouchableOpacity>
            ))}
            {totalPages>1&&(
              <View style={s.pagination}>
                <TouchableOpacity style={[s.navBtn,{opacity:missionPage===0?0.3:1}]} onPress={()=>setMissionPage(p=>Math.max(0,p-1))} disabled={missionPage===0}>
                  <Text style={s.navBtnTxt}>‹</Text>
                </TouchableOpacity>
                <Text style={s.pageInfo}>Page {missionPage+1} / {totalPages}</Text>
                <TouchableOpacity style={[s.navBtn,{opacity:missionPage>=totalPages-1?0.3:1}]} onPress={()=>setMissionPage(p=>Math.min(totalPages-1,p+1))} disabled={missionPage>=totalPages-1}>
                  <Text style={s.navBtnTxt}>›</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
      </View>

      <Modal visible={!!editId} animationType="slide" transparent onRequestClose={()=>setEditId(null)}>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Modifier la mission</Text>

              <Text style={s.label}>Nom de la production</Text>
              <TxtInput style={s.input} value={fProduction} onChangeText={setFProduction} placeholderTextColor={C.muted} autoCapitalize="characters"/>

              <Text style={s.label}>Nom de l'émission (facultatif)</Text>
              <TxtInput style={s.input} value={fEmission} onChangeText={setFEmission} placeholder="Ex : Koh-Lanta" placeholderTextColor={C.muted}/>

              <Text style={s.label}>Type de mission</Text>
              <TouchableOpacity style={s.typeBtn} onPress={()=>setShowTypePicker(v=>!v)}>
                <Text style={s.typeBtnTxt}>{fType}</Text>
                <Text style={s.typeBtnChevron}>{showTypePicker?'▴':'▾'}</Text>
              </TouchableOpacity>
              {showTypePicker && (
                <View style={s.typePickerInline}>
                  {([['Technique',POSTES_TECH],['Artiste',POSTES_ARTISTE],['Musique / scène',POSTES_MUSIQUE],['Autre',POSTES_AUTRE]] as [string,string[]][]).map(([grp,list])=>(
                    <View key={grp}>
                      <Text style={s.typeGroupLbl}>{grp}</Text>
                      <View style={s.typeWrap}>
                        {list.map(p=>(
                          <TouchableOpacity key={p} style={[s.typeChip,fType===p&&s.typeChipActive]} onPress={()=>{setFType(p);setShowTypePicker(false);}}>
                            <Text style={fType===p?s.typeChipTxtActive:s.typeChipTxt}>{p}</Text>
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
                <DateTimePicker value={fStart} mode="date" themeVariant="light" display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowStartPicker(false);if(date){setFStart(date);if(date>fEnd)setFEnd(date);}}}/>
              )}
              {showEndPicker&&(
                <DateTimePicker value={fEnd} mode="date" themeVariant="light" display={Platform.OS==='ios'?'spinner':'default'}
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
  badge:{flex:1,backgroundColor:C.card,borderRadius:16,padding:14,borderLeftWidth:4,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:8,elevation:2},
  badgeVal:{fontSize:20,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  badgeLbl:{fontSize:11,color:C.muted,fontWeight:'700',marginTop:4},
  areBox:{marginHorizontal:16,backgroundColor:C.card,borderRadius:16,padding:14,borderWidth:1,borderColor:C.line},
  areLabel:{fontSize:11,fontWeight:'900',color:C.petrol,marginBottom:8,textTransform:'uppercase',letterSpacing:0.5},
  arePickerBtn:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:C.line,borderRadius:12,paddingVertical:12,paddingHorizontal:14,backgroundColor:C.soft},
  arePickerTxt:{fontSize:15,fontWeight:'700',color:C.petrol},
  arePickerPlaceholder:{fontSize:15,color:C.muted},
  arePickerIcon:{fontSize:16},
  areInfo:{fontSize:11,color:C.muted,marginTop:6,fontStyle:'italic'},
  areValidateBtn:{backgroundColor:C.petrol,borderRadius:12,paddingVertical:13,alignItems:'center',marginTop:10},
  areValidateTxt:{color:'#FFFFFF',fontWeight:'800',fontSize:15},
  chartCard:{marginHorizontal:16,backgroundColor:C.card,borderRadius:22,padding:4,borderWidth:1,borderColor:C.line,marginTop:12,shadowColor:C.petrol,shadowOpacity:0.06,shadowRadius:16,elevation:3},
  section:{marginHorizontal:16,marginTop:16},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  sectionTitle:{fontSize:17,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  monthNav:{flexDirection:'row',alignItems:'center',gap:8},
  navBtn:{width:34,height:34,borderRadius:17,backgroundColor:C.soft,justifyContent:'center',alignItems:'center'},
  navBtnTxt:{fontSize:18,fontWeight:'900',color:C.petrol,lineHeight:20},
  monthLbl:{fontSize:13,fontWeight:'800',color:C.petrol,minWidth:110,textAlign:'center'},
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  statBox:{width:'47%',backgroundColor:C.card,borderRadius:14,padding:14,alignItems:'center',shadowColor:'#000',shadowOpacity:0.04,shadowRadius:6,elevation:2},
  statVal:{fontSize:17,fontWeight:'900',color:C.petrol},
  statSub:{fontSize:10,color:C.muted,fontWeight:'700',marginTop:1},
  statLbl:{fontSize:10,color:C.muted,fontWeight:'700',marginTop:3,textTransform:'uppercase'},
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
});