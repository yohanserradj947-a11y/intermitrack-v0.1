import { showAlert } from "../../lib/dialog";
import { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTrackView } from '../../lib/analytics';
import DonutChart from '../../components/DonutChart';
import NumInput from '../../components/NumInput';
import KmSection, { KmHandle } from '../../components/KmSection';
import { GradientButton } from '../../components/GradientButton';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemeControls } from '../../lib/theme';
import { useProdColors, PROD_PRESETS } from '../../lib/prodColors';
import { useAnnexe, modeForEdit, computeHoursVac, extraHoursOf, CACHET_H } from '../../lib/annexe';
import { usePostes } from '../../lib/postes';
import { LinearGradient } from 'expo-linear-gradient';
import ColorPickerModal from '../../components/ColorPickerModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Couleurs par production gérées via lib/prodColors (useProdColors).

function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function monthLabel(d:Date){const l=d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});return l.charAt(0).toUpperCase()+l.slice(1);}
function isoDisp(isoStr:string){if(!isoStr)return'';const[y,m,d]=isoStr.split('-');return`${d}/${m}/${y}`;}
function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function fmtPeriod(s:string,e:string){if(!e||e===s)return fmtDate(s);return fmtDate(s)+' → '+fmtDate(e);}
function iso(d:Date){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

export default function Missions(){
  useTrackView('missions');
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const { scheme } = useThemeControls();
  const { colorOrDefault, getColor, setColor, custom, addCustom } = useProdColors();
  const [colorPickerOpen,setColorPickerOpen]=useState(false);
  const { postes, addPoste, removePoste } = usePostes();
  const [fLieu,setFLieu]=useState('');
  const [showLieuSuggest,setShowLieuSuggest]=useState(false);
  const [newPoste,setNewPoste]=useState('');
  const insets=useSafeAreaInsets();
  const [missions,setMissions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<string|null>(null);
  const [period,setPeriod]=useState<'all'|'year'|'custom'|'month'|'ai'>('all');
  const [customYear,setCustomYear]=useState(new Date().getFullYear());
  const [monthRef,setMonthRef]=useState(new Date()); // filtre « Mois »
  const [areDate,setAreDate]=useState(''); // date ARE pour le filtre « Année d'intermittence »
  useEffect(()=>{ AsyncStorage.getItem('intermitrack_are_date').then(v=>{ if(v) setAreDate(v); }); },[]);
  // Fenêtre de l'année d'intermittence en cours (12 mois depuis l'anniversaire de la date ARE).
  const aiWin=useMemo(()=>{
    if(!areDate) return null;
    const a=new Date(areDate+'T00:00:00');
    const today=new Date(); today.setHours(0,0,0,0);
    let k=today.getFullYear()-a.getFullYear();
    const anniv=new Date(a); anniv.setFullYear(a.getFullYear()+k);
    if(anniv>today) k-=1;
    const start=new Date(a); start.setFullYear(a.getFullYear()+k);
    const end=new Date(a);   end.setFullYear(a.getFullYear()+k+1);
    return { start:start.getTime(), end:end.getTime(), startISO:iso(start), endISO:iso(end) };
  },[areDate]);

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
  // Saisie heures vs cachets, pilotée par l'annexe du profil (parite avec le site et l'onglet calendrier).
  const annexe=useAnnexe();
  const [fMode,setFMode]=useState<'heures'|'cachet'>('heures');
  const [fCachets,setFCachets]=useState('');
  const [fHours,setFHours]=useState('');
  const [fGross,setFGross]=useState('');
  const [showStartPicker,setShowStartPicker]=useState(false);
  const [showEndPicker,setShowEndPicker]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showSuggest,setShowSuggest]=useState(false);
  const [showEmSuggest,setShowEmSuggest]=useState(false);

  useEffect(()=>{loadMissions();},[]);
  useFocusEffect(useCallback(()=>{loadMissions();},[]));
  async function loadMissions(){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:false});
    if(data)setMissions(data);
    setLoading(false);
  }

  function openEdit(m:any){
    setEditId(m.id);
    setFProduction(m.production||''); setFEmission(m.emission||''); setFLieu(m.lieu||''); setNewPoste(''); setShowLieuSuggest(false); setFType(m.mission_type||'Montage');
    setFStart(new Date(m.mission_date+'T00:00:00'));
    setFEnd(new Date((m.end_date||m.mission_date)+'T00:00:00'));
    // Relecture selon le mode : en cachet, le champ heures ne contient que les heures EN PLUS des cachets.
    const _h=Number(m.hours||0), _v=Number(m.vacations||0);
    const _mode=modeForEdit(annexe,_h,_v);
    setFMode(_mode);
    if(_mode==='cachet'){ setFCachets(String(_v||'')); setFHours(String(extraHoursOf(_h,_v)||'')); }
    else { setFCachets(''); setFHours(String(m.hours||'')); }
    setFGross(String(m.gross_amount||'')); setFVacations(String(m.vacations||''));
    setEditKmDist(Number(m.km_distance) || 0); setEditKmRate(Number(m.km_rate) || 0);
    setShowSuggest(false); setShowEmSuggest(false); setShowTypePicker(false);
  }

  async function saveEdit(){
    if(!editId)return;
    if(!fProduction.trim()){ showAlert('Production manquante','Indique la production.'); return; }
    if(fMode==='cachet' && (!fCachets.trim()||Number(fCachets)<=0)){ showAlert('Cachets manquants','Indique le nombre de cachets.'); return; }
    setSaving(true);
    const startISO=iso(fStart), endISO=iso(fEnd);
    // En cachet : heures = cachets x 12 + heures payées en heures ; vacations = nb de cachets.
    const hv=computeHoursVac(fMode,Number(fCachets)||0,Number(fHours)||0,Number(fVacations)||0);
    const nbDays=Math.max(1,Math.min(Math.round((fEnd.getTime()-fStart.getTime())/86400000)+1,Math.round(hv.hours/8)));
    const km=kmRef.current?.values(nbDays)||{};
    const { error }=await supabase.from('missions').update({
      production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, lieu:fLieu.trim()||null, mission_type:fType,
      mission_date:startISO, end_date:endISO!==startISO?endISO:null,
      hours:hv.hours, vacations:hv.vacations, gross_amount:Number(fGross)||0,
      ...km,
    }).eq('id',editId);
    setSaving(false);
    if(error){ showAlert('Erreur',error.message); return; }
    setEditId(null); loadMissions();
  }

  async function deleteEdit(){
    if(!editId)return;
    showAlert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error,count }=await supabase.from('missions').delete({count:'exact'}).eq('id',editId);
        if(error){ showAlert('Erreur',error.message); return; }
        if(count===0){ showAlert('Bloqué','Suppression refusée (droits Supabase).'); return; }
        setEditId(null); setSelected(null); loadMissions();
      }},
    ]);
  }

  // Supprimer une mission directement (croix) sans ouvrir le formulaire.
  function quickDelete(m:any){
    showAlert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error,count }=await supabase.from('missions').delete({count:'exact'}).eq('id',m.id);
        if(error){ showAlert('Erreur',error.message); return; }
        if(count===0){ showAlert('Bloqué','Suppression refusée (droits Supabase).'); return; }
        loadMissions();
      }},
    ]);
  }

  // Prorata pour le filtre « Mois » : une mission à cheval ne compte que sa part de jours DANS le mois (cohérent avec le dashboard).
  const _mS=new Date(monthRef.getFullYear(),monthRef.getMonth(),1).getTime();
  const _mE=new Date(monthRef.getFullYear(),monthRef.getMonth()+1,0).getTime();
  const _mDays=(m:any)=>{ const s=new Date(m.mission_date+'T00:00:00').getTime(), e=new Date((m.end_date||m.mission_date)+'T00:00:00').getTime(); const tot=Math.max(1,Math.round((e-s)/86400000)+1); const a=Math.max(s,_mS), b=Math.min(e,_mE); const inM=b<a?0:Math.round((b-a)/86400000)+1; return {inM,frac:inM/tot}; };
  const _fullVac=(m:any)=>Math.max(1,Math.round((new Date((m.end_date||m.mission_date)+'T00:00:00').getTime()-new Date(m.mission_date+'T00:00:00').getTime())/86400000)+1);
  const isMonth=period==='month';
  // Valeur d'une mission selon le filtre : au prorata du mois en mode « Mois », complète sinon. Saisie rapide = vacations stockées.
  const mv=(m:any)=>{ const fast=m.mission_type==='Saisie rapide'; if(isMonth){ const {inM,frac}=_mDays(m); return { gross:Number(m.gross_amount||0)*frac, hours:Number(m.hours||0)*frac, vac:fast?(Number(m.vacations)||1):inM }; } return { gross:Number(m.gross_amount||0), hours:Number(m.hours||0), vac:fast?(Number(m.vacations)||1):_fullVac(m) }; };

  const filtered=missions.filter((m:any)=>{
    const d=new Date(m.mission_date+'T00:00:00');
    const y=d.getFullYear();
    if(period==='year')return y===new Date().getFullYear();
    if(period==='custom')return y===customYear;
    if(period==='month')return _mDays(m).inM>0; // chevauchement du mois (pas seulement le début)
    if(period==='ai')return aiWin ? (d.getTime()>=aiWin.start && d.getTime()<aiWin.end) : true;
    return true;
  });
  const years=Array.from(new Set(missions.map((m:any)=>new Date(m.mission_date+'T00:00:00').getFullYear()))).sort((a,b)=>b-a);

  const groups:{[key:string]:any[]}={};
  filtered.forEach((m:any)=>{
    const k=(m.production||'Sans production').toUpperCase().trim();
    if(!groups[k])groups[k]=[];
    groups[k].push(m);
  });
  const sorted=Object.keys(groups).map((name,i)=>({
    name, list:groups[name], color:colorOrDefault(name,i),
    gross:Math.round(groups[name].reduce((a:number,m:any)=>a+mv(m).gross,0)),
    hours:Math.round(groups[name].reduce((a:number,m:any)=>a+mv(m).hours,0)*10)/10,
    vac:groups[name].reduce((a:number,m:any)=>a+mv(m).vac,0), // 1 vacation = 1 jour (prorata du mois en mode Mois)
    count:groups[name].length,
  })).sort((a,b)=>b.gross-a.gross);

  const totalGross=sorted.reduce((a,x)=>a+x.gross,0);
  const totalHours=Math.round(sorted.reduce((a,x)=>a+x.hours,0)*10)/10;
  const totalVac=sorted.reduce((a,x)=>a+x.vac,0);

  // Suggestions de production : productions déjà saisies (dans `missions`),
  // sans doublons, insensible à la casse, filtrées sur le texte tapé.
  const prodQuery=fProduction.trim().toUpperCase();
  const knownProductions=Array.from(new Set(missions.map((m:any)=>(m.production||'').toUpperCase().trim()).filter(Boolean)));
  const prodSuggestions=prodQuery?knownProductions.filter(p=>p.includes(prodQuery)&&p!==prodQuery).slice(0,5):[];

  // Suggestions d'émission : d'abord celles déjà utilisées pour la production choisie,
  // puis les autres. Insensible à la casse, casse d'origine conservée.
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

  if(selected){
    const prod=sorted.find(p=>p.name===selected);
    if(!prod)return null;
    return(
      <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
        <View style={s.detailHeader}>
          <TouchableOpacity style={s.backBtn} onPress={()=>setSelected(null)}>
            <Text style={s.backBtnTxt}>‹ Retour</Text>
          </TouchableOpacity>
          <View style={{flex:1}}>
            <Text style={s.detailTitle}>{prod.name}</Text>
            <Text style={s.detailSub}>{prod.count} mission{prod.count>1?'s':''} enregistrée{prod.count>1?'s':''}</Text>
          </View>
        </View>
        <View style={{padding:16,gap:10}}>
          {prod.list.map((m:any)=>(
            <TouchableOpacity key={m.id} style={[s.missionCard,{borderLeftColor:prod.color}]} onPress={()=>openEdit(m)}>
              <View style={s.missionHead}>
                <View style={{flexDirection:'row',alignItems:'center',gap:5,flex:1}}><Ionicons name="document-text-outline" size={13} color={C.petrol}/><Text style={s.missionProd} numberOfLines={1}>{m.production}</Text></View>
                <View style={s.pill}><Text style={s.pillTxt}>{m.mission_type}</Text></View>
                <TouchableOpacity style={s.quickDelBtn} onPress={()=>quickDelete(m)} hitSlop={6}>
                  <Ionicons name="close" size={17} color={C.danger}/>
                </TouchableOpacity>
              </View>
              <View style={{gap:4,marginTop:8}}>
                {m.emission?<View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="videocam-outline" size={13} color={C.muted} /><Text style={s.meta}>{m.emission}</Text></View>:null}
                {m.lieu?<View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="location-outline" size={13} color={C.muted} /><Text style={s.meta}>{m.lieu}</Text></View>:null}
                <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="calendar-outline" size={13} color={C.muted} /><Text style={s.meta}>{fmtPeriod(m.mission_date,m.end_date)}</Text></View>
                <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="time-outline" size={13} color={C.muted} /><Text style={s.meta}>{m.hours}h · </Text><Ionicons name="briefcase-outline" size={13} color={C.muted} /><Text style={s.meta}> {Math.max(1,Math.round((new Date((m.end_date||m.mission_date)+'T00:00:00').getTime()-new Date(m.mission_date+'T00:00:00').getTime())/86400000)+1)} vacation(s)</Text></View>
                <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="cash-outline" size={13} color={C.muted} /><Text style={s.meta}>{money(m.gross_amount)}</Text></View>
              </View>
              <Text style={s.tapHint}>Toucher pour modifier</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Modal visible={!!editId} animationType="slide" transparent onRequestClose={()=>setEditId(null)}>
          <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle,{marginBottom:0,flex:1,textAlign:'left'}]}>Modifier la mission</Text>
                <TouchableOpacity style={s.modalClose} onPress={()=>setEditId(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={C.muted}/>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                <Text style={s.label}>Nom de la production</Text>
                <TextInput style={s.input} value={fProduction} onChangeText={(t:string)=>{setFProduction(t);setShowSuggest(true);}} onFocus={()=>setShowSuggest(true)} placeholderTextColor={C.muted} autoCapitalize="characters"/>
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
                    {!!getColor(fProduction)&&<Text style={{fontSize:11,color:C.muted,marginTop:6}}>Mémorisée et appliquée partout (calendrier, missions, graphique).</Text>}
                    <ColorPickerModal visible={colorPickerOpen} initial={getColor(fProduction)||'#1E6FE0'} onClose={()=>setColorPickerOpen(false)} onPick={(hex)=>{ addCustom(hex); setColor(fProduction,hex); setColorPickerOpen(false); }} />
                  </>
                )}

                <Text style={s.label}>Nom de l'émission (facultatif)</Text>
                <TextInput style={s.input} value={fEmission} onChangeText={(t:string)=>{setFEmission(t);setShowEmSuggest(true);}} onFocus={()=>setShowEmSuggest(true)} placeholder="Ex : Koh-Lanta" placeholderTextColor={C.muted}/>
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
                <TextInput style={s.input} value={fLieu} onChangeText={(t:string)=>{setFLieu(t);setShowLieuSuggest(true);}} onFocus={()=>setShowLieuSuggest(true)} placeholder="Ex : Studio 130…" placeholderTextColor={C.muted}/>
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
                      <TextInput style={[s.input,{flex:1}]} value={newPoste} onChangeText={setNewPoste} placeholder="Ex : Clown, Cascadeur…" placeholderTextColor={C.muted}/>
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
                  <DateTimePicker value={fStart} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS==='ios'?'spinner':'default'}
                    onChange={(_e,date)=>{setShowStartPicker(false);if(date){setFStart(date);if(date>fEnd)setFEnd(date);}}}/>
                )}
                {showEndPicker&&(
                  <DateTimePicker value={fEnd} mode="date" locale="fr-FR" themeVariant={scheme} display={Platform.OS==='ios'?'spinner':'default'}
                    onChange={(_e,date)=>{setShowEndPicker(false);if(date)setFEnd(date);}}/>
                )}

                {/* « Les deux » : l'utilisateur choisit mission par mission. En technicien / artiste, l'annexe impose le mode. */}
                {annexe==='les_deux' && (
                  <View style={{flexDirection:'row',gap:8,marginTop:10}}>
                    {([['heures','Heures'],['cachet','Cachets']] as ['heures'|'cachet',string][]).map(([val,lbl])=>(
                      <TouchableOpacity key={val} style={[s.mmOpt, fMode===val&&{backgroundColor:C.petrol,borderColor:C.petrol}]} onPress={()=>setFMode(val)}>
                        <Text style={[s.mmOptTxt, fMode===val&&{color:'#fff'}]}>{lbl}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {fMode==='cachet' && (<>
                  <Text style={s.label}>Nombre de cachets</Text>
                  <NumInput style={s.input} value={fCachets} onChangeText={setFCachets} placeholder="Ex : 2" placeholderTextColor={C.muted}/>
                  <Text style={{fontSize:11,color:C.muted,marginTop:4}}>1 cachet = {CACHET_H} h pour le comptage des 507 h. Indique le nombre de cachets tel qu'il figure sur ton AEM.</Text>
                </>)}

                <Text style={s.label}>{fMode==='cachet'?'Heures payées en heures (facultatif)':'Heures cumulées'}</Text>
                <NumInput style={s.input} value={fHours} onChangeText={setFHours}/>
                {fMode==='cachet' && <Text style={{fontSize:11,color:C.muted,marginTop:4}}>Répétitions, ateliers… payés en heures et non en cachets, sur ce même contrat. Elles s'ajoutent aux cachets.</Text>}

                {/* En cachet, le nombre de vacations EST le nombre de cachets : on ne le redemande pas. */}
                {fMode!=='cachet' && (<>
                <Text style={s.label}>Nombre de vacations</Text>
                <NumInput style={s.input} value={fVacations} onChangeText={setFVacations} placeholder="Ex : 1" placeholderTextColor={C.muted}/>
                <Text style={{fontSize:11,color:C.muted,marginTop:4}}>1 vacation = 1 journée de travail.</Text>
                </>)}

                <Text style={s.label}>Montant brut (€)</Text>
                <NumInput style={s.input} value={fGross} onChangeText={setFGross}/>

                <KmSection key={editId} ref={kmRef} nbDays={Math.max(1, Math.min(Math.round((fEnd.getTime() - fStart.getTime()) / 86400000) + 1, Math.round((Number(fHours) || 0) / 8)))} initialDistance={editKmDist} initialRate={editKmRate} />

                <GradientButton onPress={saveEdit} disabled={saving} style={s.saveBtn} textStyle={s.saveBtnTxt} label={saving?'Enregistrement…':'Mettre à jour'} />
                <TouchableOpacity style={s.deleteBtn} onPress={deleteEdit}>
                  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><Ionicons name="trash-outline" size={15} color={C.danger}/><Text style={s.deleteBtnTxt}>Supprimer cette mission</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={()=>setEditId(null)}>
                  <Text style={s.cancelBtnTxt}>Annuler</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    );
  }

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Mes missions</Text>
        <Text style={s.pageSub}>Répartition du brut par production</Text>
      </View>

      <View style={s.periodBar}>
        <TouchableOpacity style={[s.periodChip,period==='all'&&s.periodOn]} onPress={()=>setPeriod('all')}>
          <Text style={period==='all'?s.periodTxtOn:s.periodTxt}>Tout</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.periodChip,period==='month'&&s.periodOn]} onPress={()=>setPeriod('month')}>
          <Text style={period==='month'?s.periodTxtOn:s.periodTxt}>Mois</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.periodChip,period==='year'&&s.periodOn]} onPress={()=>setPeriod('year')}>
          <Text style={period==='year'?s.periodTxtOn:s.periodTxt}>Année civile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.periodChip,period==='ai'&&s.periodOn]} onPress={()=>setPeriod('ai')}>
          <Text style={period==='ai'?s.periodTxtOn:s.periodTxt}>Année interm.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.periodChip,period==='custom'&&s.periodOn]} onPress={()=>setPeriod('custom')}>
          <Text style={period==='custom'?s.periodTxtOn:s.periodTxt}>Par année</Text>
        </TouchableOpacity>
      </View>

      {period==='custom'&&(
        <View style={s.yearBar}>
          {years.map(y=>(
            <TouchableOpacity key={y} style={[s.yearChip,customYear===y&&s.periodOn]} onPress={()=>setCustomYear(y)}>
              <Text style={customYear===y?s.periodTxtOn:s.periodTxt}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {period==='month'&&(
        <View style={s.monthNav}>
          <TouchableOpacity style={s.monthNavBtn} onPress={()=>setMonthRef(d=>{const n=new Date(d);n.setDate(1);n.setMonth(n.getMonth()-1);return n;})}><Ionicons name="chevron-back" size={18} color={C.petrol}/></TouchableOpacity>
          <Text style={s.monthNavLbl}>{monthLabel(monthRef)}</Text>
          <TouchableOpacity style={s.monthNavBtn} onPress={()=>setMonthRef(d=>{const n=new Date(d);n.setDate(1);n.setMonth(n.getMonth()+1);return n;})}><Ionicons name="chevron-forward" size={18} color={C.petrol}/></TouchableOpacity>
        </View>
      )}

      {period==='ai'&&(
        <View style={s.aiInfo}>
          {aiWin
            ? <Text style={s.aiInfoTxt}>Du {isoDisp(aiWin.startISO)} au {isoDisp(aiWin.endISO)} · année d&apos;intermittence en cours</Text>
            : <Text style={s.aiInfoTxt}>Renseigne ta date ARE dans le Tableau de bord pour activer ce filtre.</Text>}
        </View>
      )}

      <View style={s.statsRow}>
        <View style={s.statBox}><Text style={s.statVal}>{totalVac}</Text><Text style={s.statLbl}>VACATIONS</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{totalHours}h</Text><Text style={s.statLbl}>HEURES</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{money(totalGross)}</Text><Text style={s.statLbl}>BRUT TOTAL</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{sorted.length}</Text><Text style={s.statLbl}>PROD.</Text></View>
      </View>

      {totalGross>0&&(
        <View style={s.chartWrap}>
          <DonutChart
            slices={sorted.map((p)=>({name:p.name,value:p.gross,color:p.color}))}
            centerTop={money(totalGross)}
            centerBottom="brut total"
          />
        </View>
      )}

      <View style={{paddingHorizontal:16,gap:8}}>
        {sorted.length===0
          ?<Text style={s.empty}>Aucune mission sur cette période.</Text>
          :sorted.map((p)=>(
            <TouchableOpacity key={p.name} style={s.legendRow} onPress={()=>setSelected(p.name)}>
              <View style={[s.legendDot,{backgroundColor:p.color}]}/>
              <View style={s.legendBody}>
                <Text style={s.legendName}>{p.name}</Text>
                <Text style={s.legendDetail}>{p.count} mission{p.count>1?'s':''} · {p.hours}h</Text>
              </View>
              <Text style={s.legendPct}>{totalGross>0?Math.round((p.gross/totalGross)*100):0}%</Text>
              <Text style={s.legendAmount}>{money(p.gross)}</Text>
              <Text style={{fontSize:16,color:C.muted,marginLeft:4}}>›</Text>
            </TouchableOpacity>
          ))
        }
      </View>
    </ScrollView>
  );
}

const makeS=(C:any)=>StyleSheet.create({
  container:{flex:1,backgroundColor:'transparent'},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  pageHeader:{backgroundColor:C.card,padding:18,paddingTop:52,borderBottomWidth:1,borderBottomColor:C.line},
  pageTitle:{fontSize:22,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  pageSub:{fontSize:13,color:C.muted,marginTop:4},
  periodBar:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingHorizontal:16,paddingTop:16},
  periodChip:{paddingVertical:9,paddingHorizontal:14,borderRadius:12,backgroundColor:C.card,borderWidth:1,borderColor:C.line,alignItems:'center'},
  monthNav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginHorizontal:16,marginTop:10},
  monthNavBtn:{width:38,height:38,borderRadius:19,backgroundColor:C.soft,alignItems:'center',justifyContent:'center'},
  monthNavLbl:{flex:1,textAlign:'center',fontSize:14,fontWeight:'800',color:C.petrol,backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:12,paddingVertical:10},
  aiInfo:{marginHorizontal:16,marginTop:10,padding:11,borderRadius:12,backgroundColor:C.soft},
  aiInfoTxt:{fontSize:12,fontWeight:'700',color:C.petrol,textAlign:'center'},
  periodOn:{backgroundColor:C.petrol,borderColor:C.petrol},
  periodTxt:{fontSize:13,fontWeight:'700',color:C.petrol},
  periodTxtOn:{fontSize:13,fontWeight:'700',color:'white'},
  yearBar:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingHorizontal:16,paddingTop:10},
  yearChip:{paddingVertical:8,paddingHorizontal:16,borderRadius:99,backgroundColor:C.card,borderWidth:1,borderColor:C.line},
  statsRow:{flexDirection:'row',padding:16,gap:8},
  statBox:{flex:1,backgroundColor:C.card,borderRadius:14,padding:10,alignItems:'center',shadowColor:'#000',shadowOpacity:0.04,shadowRadius:6,elevation:2},
  statHL:{backgroundColor:C.petrol},
  statVal:{fontSize:14,fontWeight:'900',color:C.petrol,textAlign:'center'},
  statLbl:{fontSize:8,color:C.muted,fontWeight:'700',marginTop:3,textTransform:'uppercase',textAlign:'center'},
  chartWrap:{marginHorizontal:16,backgroundColor:C.card,borderRadius:18,padding:16,borderWidth:1,borderColor:C.line,marginBottom:8},
  legendRow:{backgroundColor:C.card,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:C.line},
  legendDot:{width:12,height:12,borderRadius:4,flexShrink:0},
  legendBody:{flex:1,minWidth:0},
  legendName:{fontSize:13,fontWeight:'900',color:C.petrol},
  legendDetail:{fontSize:11,color:C.muted,marginTop:2},
  legendPct:{fontSize:12,fontWeight:'700',color:C.muted,minWidth:32,textAlign:'right'},
  legendAmount:{fontSize:14,fontWeight:'900',color:C.petrol,minWidth:60,textAlign:'right'},
  detailHeader:{flexDirection:'row',alignItems:'center',gap:12,padding:16,paddingTop:52,backgroundColor:C.card,borderBottomWidth:1,borderBottomColor:C.line},
  backBtn:{backgroundColor:C.soft,borderRadius:12,paddingVertical:8,paddingHorizontal:14},
  backBtnTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
  detailTitle:{fontSize:18,fontWeight:'900',color:C.petrol},
  detailSub:{fontSize:12,color:C.muted,marginTop:2},
  missionCard:{backgroundColor:C.card,borderRadius:16,padding:14,borderWidth:1,borderColor:C.line,borderLeftWidth:4,borderLeftColor:C.petrol},
  quickDelBtn:{width:30,height:30,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:C.danger+'1A',marginLeft:6},
  modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  modalClose:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:C.soft},
  missionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
  missionProd:{fontSize:14,fontWeight:'900',color:C.petrol,flex:1,textTransform:'uppercase'},
  pill:{backgroundColor:C.soft,borderRadius:99,paddingHorizontal:9,paddingVertical:4},
  pillTxt:{fontSize:10,fontWeight:'700',color:C.petrol},
  meta:{fontSize:12,fontWeight:'600',color:C.text},
  tapHint:{fontSize:11,color:C.muted,fontStyle:'italic',marginTop:8,textAlign:'right'},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'flex-end'},
  modalCard:{backgroundColor:C.bg,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'90%'},
  modalTitle:{fontSize:20,fontWeight:'900',color:C.petrol,marginBottom:12,textAlign:'center'},
  label:{fontSize:13,fontWeight:'700',color:C.text,marginTop:12,marginBottom:6},
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:13,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:C.card},
  // Sélecteur Heures / Cachets (annexe « les deux ») — couleurs du thème, comme dans l'onglet calendrier.
  mmOpt:{flex:1,paddingVertical:10,borderRadius:11,borderWidth:1.5,borderColor:C.line,backgroundColor:C.card,alignItems:'center'},
  mmOptTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
  inputTxt:{fontSize:15,color:C.text},
  suggestBox:{backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:14,marginTop:6,overflow:'hidden'},
  suggestItem:{paddingVertical:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:C.soft},
  suggestTxt:{fontSize:15,fontWeight:'700',color:C.petrol},
  row:{flexDirection:'row',gap:10},
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
  saveBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:15,alignItems:'center',marginTop:20},
  saveBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  deleteBtn:{backgroundColor:C.card,borderRadius:15,paddingVertical:14,alignItems:'center',marginTop:10},
  deleteBtnTxt:{color:C.danger,fontWeight:'800',fontSize:14},
  cancelBtn:{paddingVertical:14,alignItems:'center',marginTop:4},
  cancelBtnTxt:{color:C.muted,fontWeight:'700',fontSize:14},
  empty:{textAlign:'center',color:C.muted,padding:20},
  colorRow:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center',marginTop:2},
  colorSw:{width:32,height:32,borderRadius:9,borderWidth:2,borderColor:'transparent',alignItems:'center',justifyContent:'center',overflow:'hidden'},
  colorSwOn:{borderColor:C.text},
  colorAdd:{width:32,height:32,borderRadius:9,borderWidth:1,borderStyle:'dashed',borderColor:C.muted,alignItems:'center',justifyContent:'center'},
  colorAddTxt:{fontSize:18,fontWeight:'800',color:C.muted,lineHeight:20},
});