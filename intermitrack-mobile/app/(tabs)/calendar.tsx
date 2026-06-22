import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import NumInput from '../../components/NumInput';
import TxtInput from '../../components/TxtInput';

const C = { petrol:'#1F4E5F', sage:'#7A9E7E', sageSoft:'#E6F0E8', bg:'#EEF2F1', card:'#FFFFFF', text:'#2D3748', muted:'#718096', line:'#E2E8F0', soft:'#EEF4F1', orange:'#F97316', orangeSoft:'#FFF1E6' };
const TYPES = ['Montage','Tournage','Démontage'];

function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function iso(d:Date){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function monthLabel(d:Date){const l=d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});return l.charAt(0).toUpperCase()+l.slice(1);}
function frDay(ds:string){return new Date(ds+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});}
function daysInclusive(a:Date,b:Date){return Math.max(1,Math.round((b.getTime()-a.getTime())/86400000)+1);}
function isNextDay(aStr:string,bStr:string){const a=new Date(aStr+'T00:00:00');a.setDate(a.getDate()+1);return iso(a)===bStr;}

export default function Calendar(){
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
  const [fStart,setFStart]=useState(new Date());
  const [fEnd,setFEnd]=useState(new Date());
  const [fHours,setFHours]=useState('');
  const [fGross,setFGross]=useState('');
  const [showStartPicker,setShowStartPicker]=useState(false);
  const [showEndPicker,setShowEndPicker]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showSuggest,setShowSuggest]=useState(false);
  const [showEmSuggest,setShowEmSuggest]=useState(false);

  const [showMdp,setShowMdp]=useState(false);
  const [mdpDays,setMdpDays]=useState<{date:string;checked:boolean;hours:number}[]>([]);
  const [defaultH,setDefaultH]=useState('8');

  useEffect(()=>{loadMissions();},[]);
  useFocusEffect(useCallback(()=>{loadMissions(true);},[]));
  async function loadMissions(silent=false){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:true});
    if(data)setMissions(data);
    if(!silent)setLoading(false);
  }

  function openCreate(day:Date){
    setEditId(null);
    setFProduction(''); setFEmission(''); setFType('Montage'); setFStart(day); setFEnd(day);
    setFHours(''); setFGross('');
    setShowSuggest(false); setShowEmSuggest(false);
    setShowForm(true);
  }
  function openEdit(m:any){
    setEditId(m.id);
    setFProduction(m.production||''); setFEmission(m.emission||''); setFType(m.mission_type||'Montage');
    setFStart(new Date((m.mission_date)+'T00:00:00'));
    setFEnd(new Date((m.end_date||m.mission_date)+'T00:00:00'));
    setFHours(String(m.hours||'')); setFGross(String(m.gross_amount||''));
    setShowSuggest(false); setShowEmSuggest(false);
    setShowForm(true);
  }

  async function saveSimple(){
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user){ Alert.alert('Erreur','Tu n\'es plus connecté.'); setSaving(false); return; }
    const startISO=iso(fStart), endISO=iso(fEnd);
    const payload={
      user_id:user.id, production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, mission_type:fType,
      mission_date:startISO, end_date:endISO!==startISO?endISO:null,
      hours:Number(fHours)||0, vacations:Math.round((Number(fHours)||0)/8),
      gross_amount:Number(fGross)||0, status:'effectue',
    };
    const { error }= editId
      ? await supabase.from('missions').update(payload).eq('id',editId)
      : await supabase.from('missions').insert(payload);
    setSaving(false);
    if(error){ Alert.alert('Erreur',error.message); return; }
    setShowForm(false); setEditId(null); loadMissions(true);
  }

  function handleSave(){
    if(!fProduction.trim()){ Alert.alert('Production manquante','Indique le nom de la production.'); return; }
    if(!fHours.trim()){ Alert.alert('Heures manquantes','Indique le nombre d\'heures.'); return; }
    const nb=daysInclusive(fStart,fEnd);
    if(!editId && nb>=2){
      // Heures/jour proposées = total saisi ÷ nombre de jours (arrondi à 0,1h), 8h par défaut si vide.
      const perDay=Math.round((Number(fHours)/nb)*10)/10 || 8;
      const days:{date:string;checked:boolean;hours:number}[]=[];
      for(let d=new Date(fStart); d<=fEnd; d.setDate(d.getDate()+1)) days.push({date:iso(d),checked:true,hours:perDay});
      setMdpDays(days); setDefaultH(String(perDay)); setShowForm(false); setShowMdp(true);
    }else{
      saveSimple();
    }
  }

  async function deleteMission(){
    if(!editId)return;
    Alert.alert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error, count }=await supabase.from('missions').delete({count:'exact'}).eq('id',editId);
        if(error){ Alert.alert('Erreur',error.message); return; }
        if(count===0){ Alert.alert('Bloqué','La suppression a été refusée (droits Supabase / RLS).'); return; }
        setShowForm(false); setEditId(null); loadMissions(true);
      }},
    ]);
  }

  function mdpRedistribute(ds:{date:string;checked:boolean;hours:number}[]){
    const n=ds.filter(d=>d.checked).length;
    if(!n)return ds;
    const per=Math.round((Number(fHours)/n)*10)/10||0;
    return ds.map(d=>d.checked?{...d,hours:per}:d);
  }
  function toggleDay(i:number){ setMdpDays(ds=>mdpRedistribute(ds.map((d,idx)=>idx===i?{...d,checked:!d.checked}:d))); }
  function setDayHours(i:number,h:string){ setMdpDays(ds=>ds.map((d,idx)=>idx===i?{...d,hours:Number(h)||0}:d)); }
  function setAll(val:boolean){ setMdpDays(ds=>mdpRedistribute(ds.map(d=>({...d,checked:val})))); }
  function applyDefault(){ const v=Number(defaultH)||0; setMdpDays(ds=>ds.map(d=>d.checked?{...d,hours:v}:d)); }
  const mdpChecked=mdpDays.filter(d=>d.checked);
  const mdpTotalH=Math.round(mdpChecked.reduce((a,d)=>a+(Number(d.hours)||0),0)*10)/10;

  async function validateMdp(){
    if(mdpChecked.length===0){ Alert.alert('Aucun jour','Coche au moins un jour travaillé.'); return; }
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user){ Alert.alert('Erreur','Tu n\'es plus connecté.'); setSaving(false); return; }
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
      return { user_id:user.id, production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, mission_type:fType,
        mission_date:r.start, end_date:r.end!==r.start?r.end:null,
        hours:runHours, vacations:Math.round(runHours/8), gross_amount:gross, status:'effectue' };
    });
    const grossSum=payloads.reduce((a,p)=>a+p.gross_amount,0);
    if(payloads.length)payloads[0].gross_amount+=(totalGross-grossSum);
    const { error }=await supabase.from('missions').insert(payloads);
    setSaving(false);
    if(error){ Alert.alert('Erreur',error.message); return; }
    setShowMdp(false); loadMissions(true);
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

  function moveMonth(n:number){const d=new Date(current);d.setMonth(d.getMonth()+n);d.setDate(1);setCurrent(d);setPage(0);}

  function onCellPress(d:Date){
    const ms=missionsOn(d);
    if(ms.length===0){ openCreate(d); return; }
    const buttons:any[] = ms.map((m:any)=>({
text:'Modifier : '+(m.production||'Mission')+' ('+(Math.round((Number(m.hours||0)/daysInclusive(new Date((m.mission_date)+'T00:00:00'),new Date((m.end_date||m.mission_date)+'T00:00:00')))*10)/10)+'h/jour)',      onPress:()=>openEdit(m),
    }));
    buttons.push({ text:'+ Ajouter une mission ce jour', onPress:()=>openCreate(d) });
    buttons.push({ text:'Annuler', style:'cancel' });
    Alert.alert(
      frDay(iso(d)).charAt(0).toUpperCase()+frDay(iso(d)).slice(1),
      'Que veux-tu faire ?',
      buttons
    );
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

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.headerBar}><Text style={s.headerTitle}>{monthLabel(current)}</Text></View>

      <View style={s.nav}>
        <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(-1)}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
        <Text style={s.navLabel}>{monthLabel(current)}</Text>
        <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(1)}><Text style={s.navTxt}>›</Text></TouchableOpacity>
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
          let bg=C.card, border=C.line;
          if(has){ if(isPast){bg=C.sageSoft;border=C.sage;} else {bg=C.orangeSoft;border=C.orange;} }
          if(isToday){bg=C.petrol;border=C.petrol;}
          const first=ms[0];
          const txtColor=isToday?'white':(has?(isPast?C.petrol:C.orange):C.text);
          return(
            <TouchableOpacity key={i} style={[s.cell,{backgroundColor:bg,borderColor:border}]} onPress={()=>onCellPress(d)}>
              <Text style={[s.cellDay,{color:txtColor}]}>{d.getDate()}</Text>
              {first&&(
                <>
                  <Text style={[s.cellProd,{color:isToday?'white':txtColor}]} numberOfLines={1}>
                    {(first.production||'').slice(0,3).toUpperCase()}
                  </Text>
                  <Text style={[s.cellInfo,{color:isToday?'rgba(255,255,255,.8)':C.muted}]} numberOfLines={1}>
                    {Math.round((Number(first.hours||0)/daysInclusive(new Date((first.mission_date)+'T00:00:00'),new Date((first.end_date||first.mission_date)+'T00:00:00')))*10)/10}h{ms.length>1?` · +${ms.length-1}`:''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.hint}>Touche un jour pour ajouter une mission, ou une mission existante pour la modifier</Text>

      <View style={s.listHead}>
        <Text style={s.listTitle}>MISSIONS DU MOIS</Text>
        {totalPages>1&&<Text style={s.listPage}>{page+1} / {totalPages}</Text>}
      </View>
      <View style={{paddingHorizontal:16,gap:10}}>
        {monthMissions.length===0
          ?<Text style={s.empty}>Aucune mission ce mois-ci.</Text>
          :visible.map((m:any)=>{
            const past=(m.end_date||m.mission_date)<todayISO;
            return(
              <TouchableOpacity key={m.id} style={[s.missionCard,{borderLeftColor:past?C.petrol:C.orange}]} onPress={()=>openEdit(m)}>
                <View style={{flex:1}}>
                  <Text style={s.mProd}>{m.production}</Text>
                  {m.emission?<Text style={s.mEmission}>{m.emission}</Text>:null}
                  <Text style={s.mDate}>{fmtDate(m.mission_date)}</Text>
                </View>
                <View style={{alignItems:'flex-end',gap:6}}>
                  <Text style={s.mHours}>{m.hours}h</Text>
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
                      <Text style={s.suggestTxt}>🔁 {p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={s.label}>Nom de l'émission (facultatif)</Text>
              <TxtInput style={s.input} value={fEmission} onChangeText={(t:string)=>{setFEmission(t);setShowEmSuggest(true);}} onFocus={()=>setShowEmSuggest(true)} placeholder="Ex : Koh-Lanta" placeholderTextColor={C.muted}/>
              {showEmSuggest&&emSuggestions.length>0&&(
                <View style={s.suggestBox}>
                  {emSuggestions.map(e=>(
                    <TouchableOpacity key={e} style={s.suggestItem} onPress={()=>{setFEmission(e);setShowEmSuggest(false);}}>
                      <Text style={s.suggestTxt}>🎬 {e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={s.label}>Type de mission</Text>
              <View style={s.typeWrap}>
                {TYPES.map(t=>(
                  <TouchableOpacity key={t} style={[s.typeChip,fType===t&&s.typeChipActive]} onPress={()=>setFType(t)}>
                    <Text style={fType===t?s.typeChipTxtActive:s.typeChipTxt}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

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
                <DateTimePicker value={fStart} mode="date" display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowStartPicker(false);if(date){setFStart(date);if(date>fEnd)setFEnd(date);}}}/>
              )}
              {showEndPicker&&(
                <DateTimePicker value={fEnd} mode="date" display={Platform.OS==='ios'?'spinner':'default'}
                  onChange={(_e,date)=>{setShowEndPicker(false);if(date)setFEnd(date);}}/>
              )}

              <Text style={s.label}>Heures cumulées</Text>
              <NumInput style={s.input} value={fHours} onChangeText={setFHours} placeholder="8" placeholderTextColor={C.muted}/>

              <Text style={s.label}>Montant brut (€)</Text>
              <NumInput style={s.input} value={fGross} onChangeText={setFGross} placeholder="0" placeholderTextColor={C.muted}/>

              {!editId&&<Text style={s.miniHint}>Pour une période de 3 jours ou plus, tu pourras choisir les jours travaillés à l'étape suivante.</Text>}

              <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                <Text style={s.saveBtnTxt}>{saving?'Enregistrement…':(editId?'Mettre à jour':'Enregistrer la mission')}</Text>
              </TouchableOpacity>
              {editId&&(
                <TouchableOpacity style={s.deleteBtn} onPress={deleteMission}>
                  <Text style={s.deleteBtnTxt}>🗑️ Supprimer cette mission</Text>
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
              <View style={s.mdpFill}>
                <Text style={s.mdpFillLbl}>Heures / jour :</Text>
                <NumInput style={s.mdpFillInput} value={defaultH} onChangeText={setDefaultH}/>
                <TouchableOpacity style={s.mdpTool} onPress={applyDefault}><Text style={s.mdpToolTxt}>Appliquer</Text></TouchableOpacity>
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
              <TouchableOpacity style={s.saveBtn} onPress={validateMdp} disabled={saving}>
                <Text style={s.saveBtnTxt}>{saving?'Enregistrement…':'Valider'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setShowMdp(false)}>
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

const s=StyleSheet.create({
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
cell:{width:'14.28%',height:70,padding:5,borderWidth:1.5,borderRadius:14,marginBottom:4,overflow:'hidden',shadowColor:'#000',shadowOpacity:0.03,shadowRadius:3,elevation:1},   cellDay:{fontSize:14,fontWeight:'800'},
  cellProd:{fontSize:9,fontWeight:'900',marginTop:2},
  cellInfo:{fontSize:8,fontWeight:'600'},
  hint:{textAlign:'center',fontSize:11,color:C.muted,fontStyle:'italic',marginTop:8,marginBottom:4,paddingHorizontal:20},
  listHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:18,marginTop:18,marginBottom:10},
  listTitle:{fontSize:13,fontWeight:'900',color:C.text,letterSpacing:0.5},
  listPage:{fontSize:12,fontWeight:'700',color:C.muted},
  empty:{textAlign:'center',color:C.muted,padding:20},
  missionCard:{backgroundColor:C.card,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',borderLeftWidth:4,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:8,elevation:2},
  mProd:{fontSize:15,fontWeight:'900',color:C.petrol},
  mEmission:{fontSize:12,color:C.text,marginTop:2,fontStyle:'italic'},
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
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:13,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:'white'},
  inputTxt:{fontSize:15,color:C.text},
  suggestBox:{backgroundColor:'white',borderWidth:1,borderColor:C.line,borderRadius:14,marginTop:6,overflow:'hidden'},
  suggestItem:{paddingVertical:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:C.soft},
  suggestTxt:{fontSize:15,fontWeight:'700',color:C.petrol},
  row:{flexDirection:'row',gap:10},
  typeWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  typeChip:{paddingVertical:9,paddingHorizontal:14,borderRadius:99,backgroundColor:C.soft},
  typeChipActive:{backgroundColor:C.petrol},
  typeChipTxt:{fontSize:13,fontWeight:'700',color:C.petrol},
  typeChipTxtActive:{fontSize:13,fontWeight:'700',color:'white'},
  saveBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:15,alignItems:'center',marginTop:20},
  saveBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  deleteBtn:{backgroundColor:'#FFF5F5',borderRadius:15,paddingVertical:14,alignItems:'center',marginTop:10},
  deleteBtnTxt:{color:'#E53E3E',fontWeight:'800',fontSize:14},
  cancelBtn:{paddingVertical:14,alignItems:'center',marginTop:4},
  cancelBtnTxt:{color:C.muted,fontWeight:'700',fontSize:14},
  mdpTools:{flexDirection:'row',gap:8,marginBottom:10},
  mdpTool:{paddingVertical:8,paddingHorizontal:12,borderRadius:10,backgroundColor:C.soft},
  mdpToolTxt:{fontSize:12,fontWeight:'800',color:C.petrol},
  mdpFill:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.soft,borderRadius:11,padding:10,marginBottom:14},
  mdpFillLbl:{fontSize:13,fontWeight:'700',color:C.petrol},
  mdpFillInput:{width:60,backgroundColor:'white',borderWidth:1,borderColor:C.line,borderRadius:9,paddingVertical:6,paddingHorizontal:8,textAlign:'center',fontSize:14},
  mdpDay:{flexDirection:'row',alignItems:'center',gap:11,padding:10,borderWidth:1,borderColor:C.line,borderRadius:12,marginBottom:7,backgroundColor:'white'},
  checkbox:{width:24,height:24,borderRadius:7,borderWidth:2,borderColor:C.petrol,justifyContent:'center',alignItems:'center'},
  checkboxOn:{backgroundColor:C.petrol},
  checkmark:{color:'white',fontWeight:'900',fontSize:14},
  mdpDayLabel:{flex:1,fontSize:13,fontWeight:'700',color:C.text,textTransform:'capitalize'},
  mdpHours:{width:60,backgroundColor:'white',borderWidth:1,borderColor:C.line,borderRadius:9,paddingVertical:7,paddingHorizontal:8,textAlign:'center',fontSize:14},
  mdpHoursU:{fontSize:12,color:C.muted},
  mdpTotal:{backgroundColor:C.soft,borderRadius:11,padding:12,marginTop:6,marginBottom:8},
  mdpTotalTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
});