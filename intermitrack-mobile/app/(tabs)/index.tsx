import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Platform, Modal, TextInput, Alert, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/auth';
import Gauge from '../../components/Gauge';
import NumInput from '../../components/NumInput';
import TxtInput from '../../components/TxtInput';

const C = { petrol:'#1F4E5F', sage:'#7A9E7E', bg:'#F5F7F6', card:'#FFFFFF', text:'#2D3748', muted:'#718096', line:'#E2E8F0', soft:'#EEF4F1', orange:'#F97316' };
const TYPES = ['Montage','Tournage','Démontage'];

function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function fmtPeriod(s:string,e:string){if(!e||e===s)return fmtDate(s);return fmtDate(s)+' → '+fmtDate(e);}
function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function monthLabel(d:Date){return d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});}
function isoToDisplay(iso:string){if(!iso)return'';const[y,m,d]=iso.split('-');return`${d}/${m}/${y}`;}
function iso(d:Date){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

export default function HomeScreen(){
  const { session, signOut } = useSession();
  const [loading,setLoading]=useState(true);
  const [missions,setMissions]=useState<any[]>([]);
  const [current,setCurrent]=useState(new Date());
  const [missionPage,setMissionPage]=useState(0);
  const [areDate,setAreDate]=useState('');
  const [showDatePicker,setShowDatePicker]=useState(false);
  const [showMonthPicker,setShowMonthPicker]=useState(false);
  const [pickerYear,setPickerYear]=useState(new Date().getFullYear());

  const [showAccount,setShowAccount]=useState(false);

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

  useEffect(()=>{loadData();},[]);
  useFocusEffect(useCallback(()=>{loadData(true);},[]));

  async function loadData(silent=false){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:true});
    if(data)setMissions(data);
    const saved=await AsyncStorage.getItem('intermitrack_are_date');
    if(saved)setAreDate(saved);
    if(!silent)setLoading(false);
  }

  function moveMonth(n:number){const d=new Date(current);d.setMonth(d.getMonth()+n);d.setDate(1);setCurrent(d);}

  function openEdit(m:any){
    setEditId(m.id);
    setFProduction(m.production||''); setFEmission(m.emission||''); setFType(m.mission_type||'Montage');
    setFStart(new Date(m.mission_date+'T00:00:00'));
    setFEnd(new Date((m.end_date||m.mission_date)+'T00:00:00'));
    setFHours(String(m.hours||'')); setFGross(String(m.gross_amount||''));
  }

  async function saveEdit(){
    if(!editId)return;
    if(!fProduction.trim()){ Alert.alert('Production manquante','Indique la production.'); return; }
    setSaving(true);
    const startISO=iso(fStart), endISO=iso(fEnd);
    const { error }=await supabase.from('missions').update({
      production:fProduction.trim().toUpperCase(), emission:fEmission.trim()||null, mission_type:fType,
      mission_date:startISO, end_date:endISO!==startISO?endISO:null,
      hours:Number(fHours)||0, vacations:Math.round((Number(fHours)||0)/8), gross_amount:Number(fGross)||0,
    }).eq('id',editId);
    setSaving(false);
    if(error){ Alert.alert('Erreur',error.message); return; }
    setEditId(null); loadData(true);
  }

  async function deleteEdit(){
    if(!editId)return;
    Alert.alert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error,count }=await supabase.from('missions').delete({count:'exact'}).eq('id',editId);
        if(error){ Alert.alert('Erreur',error.message); return; }
        if(count===0){ Alert.alert('Bloqué','Suppression refusée (droits Supabase).'); return; }
        setEditId(null); loadData(true);
      }},
    ]);
  }

  async function deleteAccount(){
    Alert.alert(
      'Supprimer mon compte ?',
      'Cette action est définitive : ton compte et toutes tes données (missions, documents) seront supprimés. Cette action est irréversible.',
      [
        {text:'Annuler',style:'cancel'},
        {text:'Supprimer définitivement',style:'destructive',onPress:async()=>{
          try{
            const { data:{ session } }=await supabase.auth.getSession();
            const token=session?.access_token;
            if(!token)throw new Error('Session expirée, reconnecte-toi.');
            const { error }=await supabase.functions.invoke('delete-account',{
              headers:{ Authorization:`Bearer ${token}` },
            });
            if(error)throw error;
            await supabase.auth.signOut();
          }catch(e:any){
            Alert.alert('Erreur',"La suppression a échoué : "+(e?.message||'réessaie plus tard.'));
          }
        }},
      ]
    );
  }

  const stats=useMemo(()=>{
    const today=new Date();today.setHours(0,0,0,0);
    const areStart=areDate?new Date(areDate+'T00:00:00'):null;
    const yearM=areStart?missions.filter((m:any)=>new Date(m.mission_date+'T00:00:00')>=areStart):missions;
    const doneM=yearM.filter((m:any)=>new Date((m.end_date||m.mission_date)+'T00:00:00')<today);
    const planM=yearM.filter((m:any)=>new Date(m.mission_date+'T00:00:00')>today);
    const upcoming=missions.filter((m:any)=>new Date((m.end_date||m.mission_date)+'T00:00:00')>=today);
    const doneH=Math.round(doneM.reduce((a:number,m:any)=>a+Number(m.hours||0),0)*10)/10;
    const planH=Math.round(planM.reduce((a:number,m:any)=>a+Number(m.hours||0),0)*10)/10;
    const remaining=Math.max(0,Math.round((507-doneH)*10)/10);
    const monthM=missions.filter((m:any)=>{const d=new Date(m.mission_date+'T00:00:00');return d.getMonth()===current.getMonth()&&d.getFullYear()===current.getFullYear();});
    const monthH=Math.round(monthM.reduce((a:number,m:any)=>a+Number(m.hours||0),0)*10)/10;
    const monthG=monthM.reduce((a:number,m:any)=>a+Number(m.gross_amount||0),0);
    const monthVac=monthM.reduce((a:number,m:any)=>a+Number(m.vacations||Math.round(Number(m.hours||0)/8)),0);
    const monthRate=monthH>0?Math.round(monthG/monthH):0;
    return { doneH, planH, remaining, monthH, monthG, monthVac, monthRate, upcoming };
  },[missions,areDate,current]);

  const { doneH, planH, remaining, monthH, monthG, monthVac, monthRate, upcoming } = stats;
  const totalPages=Math.ceil(upcoming.length/6);
  const visibleM=useMemo(()=>upcoming.slice(missionPage*6,(missionPage+1)*6),[upcoming,missionPage]);

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  const initials=(session?.user.email||'??').slice(0,2).toUpperCase();
  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <StatusBar barStyle="dark-content" backgroundColor="white"/>

      <View style={s.header}>
        <View style={s.headerBrand}>
          <View style={s.logoBox}><Text style={s.logoTxt}>iT</Text></View>
          <View>
            <Text style={s.brandName}>Intermitrack</Text>
            <Text style={s.brandTag}>Le tableau de bord des intermittents.</Text>
          </View>
        </View>
        <TouchableOpacity style={s.avatarBtn} onPress={()=>setShowAccount(true)}>
          <Text style={s.avatarTxt}>{initials}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.badgesRow}>
        <View style={[s.badge,{borderLeftColor:C.sage}]}>
          <Text style={s.badgeVal}>{doneH}h</Text>
          <Text style={s.badgeLbl}>Heures effectuées</Text>
        </View>
        <View style={[s.badge,{borderLeftColor:C.orange}]}>
          <Text style={[s.badgeVal,{color:C.orange}]}>{remaining}h</Text>
          <Text style={s.badgeLbl}>Heures restantes</Text>
        </View>
      </View>

      <View style={s.areBox}>
        <Text style={s.areLabel}>📅 Date d'admission ARE</Text>
        <TouchableOpacity style={s.arePickerBtn} onPress={()=>setShowDatePicker(true)}>
          <Text style={areDate?s.arePickerTxt:s.arePickerPlaceholder}>
            {areDate?isoToDisplay(areDate):'Choisir une date'}
          </Text>
          <Text style={s.arePickerIcon}>📅</Text>
        </TouchableOpacity>
        {areDate
          ?<Text style={s.areInfo}>Calcul depuis le {isoToDisplay(areDate)}</Text>
          :<Text style={s.areInfo}>Renseignez votre date pour un calcul précis</Text>
        }
        {showDatePicker&&(
          <DateTimePicker
            value={areDate?new Date(areDate):new Date()}
            mode="date"
            display={Platform.OS==='ios'?'spinner':'default'}
            onChange={async(_e:any,date?:Date)=>{
              setShowDatePicker(false);
              if(date){
                const isoStr=date.toISOString().slice(0,10);
                await AsyncStorage.setItem('intermitrack_are_date',isoStr);
                setAreDate(isoStr);
              }
            }}
          />
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
          <View style={s.statBox}><Text style={s.statVal}>{money(monthG)}</Text><Text style={s.statLbl}>Brut</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{monthVac}</Text><Text style={s.statLbl}>Vacations</Text></View>
          <View style={[s.statBox,{borderColor:C.petrol,borderWidth:1}]}><Text style={s.statVal}>{money(monthRate)}/h</Text><Text style={s.statLbl}>Moyenne €/h</Text></View>
        </View>
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
                  {m.emission?<Text style={s.meta}>🎬 {m.emission}</Text>:null}
                  <Text style={s.meta}>📅 {fmtPeriod(m.mission_date,m.end_date)}</Text>
                  <Text style={s.meta}>🕒 {m.hours}h · {money(m.gross_amount)}</Text>
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
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>Modifier la mission</Text>

              <Text style={s.label}>Nom de la production</Text>
              <TxtInput style={s.input} value={fProduction} onChangeText={setFProduction} placeholderTextColor={C.muted} autoCapitalize="characters"/>

              <Text style={s.label}>Nom de l'émission (facultatif)</Text>
              <TxtInput style={s.input} value={fEmission} onChangeText={setFEmission} placeholder="Ex : Koh-Lanta" placeholderTextColor={C.muted}/>

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
              <NumInput style={s.input} value={fHours} onChangeText={setFHours}/>

              <Text style={s.label}>Montant brut (€)</Text>
              <NumInput style={s.input} value={fGross} onChangeText={setFGross}/>

              <TouchableOpacity style={s.saveBtn} onPress={saveEdit} disabled={saving}>
                <Text style={s.saveBtnTxt}>{saving?'Enregistrement…':'Mettre à jour'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={deleteEdit}>
                <Text style={s.deleteBtnTxt}>🗑️ Supprimer cette mission</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setEditId(null)}>
                <Text style={s.cancelBtnTxt}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showAccount} animationType="fade" transparent onRequestClose={()=>setShowAccount(false)}>
        <TouchableOpacity style={s.accountOverlay} activeOpacity={1} onPress={()=>setShowAccount(false)}>
          <View style={s.accountCard}>
            <Text style={s.accountTitle}>Mon compte</Text>
            <Text style={s.accountEmail}>{session?.user.email}</Text>

            <TouchableOpacity style={s.accountBtn} onPress={()=>{setShowAccount(false);signOut();}}>
              <Text style={s.accountBtnTxt}>Se déconnecter</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.accountDeleteBtn} onPress={()=>{setShowAccount(false);deleteAccount();}}>
              <Text style={s.accountDeleteTxt}>Supprimer mon compte</Text>
            </TouchableOpacity>

            <View style={s.legalRow}>
              <TouchableOpacity onPress={()=>Linking.openURL('https://intermitrack.fr/cgu.html')}>
                <Text style={s.legalLink}>CGU</Text>
              </TouchableOpacity>
              <Text style={s.legalSep}>·</Text>
              <TouchableOpacity onPress={()=>Linking.openURL('https://intermitrack.fr/confidentialite.html')}>
                <Text style={s.legalLink}>Confidentialité</Text>
              </TouchableOpacity>
              <Text style={s.legalSep}>·</Text>
              <TouchableOpacity onPress={()=>Linking.openURL('https://intermitrack.fr/mentions-legales.html')}>
                <Text style={s.legalLink}>Mentions légales</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.accountCancel} onPress={()=>setShowAccount(false)}>
              <Text style={s.accountCancelTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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

const mp=StyleSheet.create({
  overlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'center',alignItems:'center',zIndex:999},
  modal:{backgroundColor:'white',borderRadius:22,padding:22,width:'85%'},
  title:{fontSize:17,fontWeight:'900',color:'#1F4E5F',textAlign:'center',marginBottom:16},
  yearRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:20,marginBottom:16},
  yearBtn:{width:36,height:36,borderRadius:18,backgroundColor:'#EEF4F1',justifyContent:'center',alignItems:'center'},
  yearBtnTxt:{fontSize:18,fontWeight:'900',color:'#1F4E5F'},
  yearLbl:{fontSize:20,fontWeight:'900',color:'#1F4E5F',minWidth:60,textAlign:'center'},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16},
  monthBtn:{width:'30%',paddingVertical:10,borderRadius:12,backgroundColor:'#F5F7F6',alignItems:'center'},
  monthBtnActive:{backgroundColor:'#1F4E5F'},
  monthTxt:{fontSize:13,fontWeight:'700',color:'#1F4E5F'},
  monthTxtActive:{color:'white'},
  closeBtn:{backgroundColor:'#EEF4F1',borderRadius:12,paddingVertical:12,alignItems:'center'},
  closeBtnTxt:{fontSize:14,fontWeight:'800',color:'#1F4E5F'},
});

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:C.bg},
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg},
  logoBox:{width:46,height:46,borderRadius:14,backgroundColor:C.petrol,justifyContent:'center',alignItems:'center'},
  logoTxt:{color:'white',fontWeight:'800',fontSize:22},
  header:{backgroundColor:'white',flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:18,paddingTop:52,paddingBottom:14,borderBottomWidth:1,borderBottomColor:C.line},
  headerBrand:{flexDirection:'row',alignItems:'center',gap:12},
  brandName:{fontSize:20,fontWeight:'800',color:C.petrol,letterSpacing:-0.5},
  brandTag:{fontSize:12,color:C.muted,marginTop:1},
  avatarBtn:{width:40,height:40,borderRadius:20,backgroundColor:C.petrol,justifyContent:'center',alignItems:'center'},
  avatarTxt:{color:'white',fontWeight:'900',fontSize:14},
  badgesRow:{flexDirection:'row',gap:12,padding:16},
  badge:{flex:1,backgroundColor:C.card,borderRadius:16,padding:14,borderLeftWidth:4,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:8,elevation:2},
  badgeVal:{fontSize:24,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  badgeLbl:{fontSize:11,color:C.muted,fontWeight:'700',marginTop:4},
  areBox:{marginHorizontal:16,backgroundColor:C.card,borderRadius:16,padding:14,borderWidth:1,borderColor:C.line},
  areLabel:{fontSize:11,fontWeight:'900',color:C.petrol,marginBottom:8,textTransform:'uppercase',letterSpacing:0.5},
  arePickerBtn:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:C.line,borderRadius:12,paddingVertical:12,paddingHorizontal:14,backgroundColor:'#F8FAF9'},
  arePickerTxt:{fontSize:15,fontWeight:'700',color:C.petrol},
  arePickerPlaceholder:{fontSize:15,color:C.muted},
  arePickerIcon:{fontSize:16},
  areInfo:{fontSize:11,color:C.muted,marginTop:6,fontStyle:'italic'},
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
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:13,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:'white'},
  inputTxt:{fontSize:15,color:C.text},
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
  accountOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'center',alignItems:'center'},
  accountCard:{backgroundColor:'white',borderRadius:22,padding:22,width:'85%'},
  accountTitle:{fontSize:18,fontWeight:'900',color:C.petrol,textAlign:'center'},
  accountEmail:{fontSize:13,color:C.muted,textAlign:'center',marginTop:4,marginBottom:18},
  accountBtn:{backgroundColor:C.petrol,borderRadius:14,paddingVertical:14,alignItems:'center'},
  accountBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  accountDeleteBtn:{backgroundColor:'#FFF5F5',borderRadius:14,paddingVertical:14,alignItems:'center',marginTop:10},
  accountDeleteTxt:{color:'#E53E3E',fontWeight:'800',fontSize:14},
  accountCancel:{paddingVertical:14,alignItems:'center',marginTop:4},
  accountCancelTxt:{color:C.muted,fontWeight:'700',fontSize:14},
  legalRow:{flexDirection:'row',justifyContent:'center',alignItems:'center',flexWrap:'wrap',gap:6,marginTop:14},
  legalLink:{fontSize:11,color:C.muted,fontWeight:'700',textDecorationLine:'underline'},
  legalSep:{fontSize:11,color:C.muted},
});