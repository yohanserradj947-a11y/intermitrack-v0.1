import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import DonutChart from '../../components/DonutChart';
import NumInput from '../../components/NumInput';

const C = { petrol:'#1F4E5F', sage:'#7A9E7E', bg:'#F5F7F6', card:'#FFFFFF', text:'#2D3748', muted:'#718096', line:'#E2E8F0', soft:'#EEF4F1', orange:'#F97316' };
const COLORS = ['#1F4E5F','#2A6174','#3A7A8F','#7A9E7E','#8AB08E','#9AC09E','#F97316','#FDBA74','#4A8FA5','#5A9FB5'];
const TYPES = ['Montage','Tournage','Démontage'];

function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function fmtPeriod(s:string,e:string){if(!e||e===s)return fmtDate(s);return fmtDate(s)+' → '+fmtDate(e);}
function iso(d:Date){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

export default function Missions(){
  const insets=useSafeAreaInsets();
  const [missions,setMissions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<string|null>(null);
  const [period,setPeriod]=useState<'all'|'year'|'custom'>('all');
  const [customYear,setCustomYear]=useState(new Date().getFullYear());

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

  useEffect(()=>{loadMissions();},[]);
  useFocusEffect(useCallback(()=>{loadMissions();},[]));
  async function loadMissions(){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:false});
    if(data)setMissions(data);
    setLoading(false);
  }

  function openEdit(m:any){
    setEditId(m.id);
    setFProduction(m.production||''); setFEmission(m.emission||''); setFType(m.mission_type||'Montage');
    setFStart(new Date(m.mission_date+'T00:00:00'));
    setFEnd(new Date((m.end_date||m.mission_date)+'T00:00:00'));
    setFHours(String(m.hours||'')); setFGross(String(m.gross_amount||''));
    setShowSuggest(false); setShowEmSuggest(false);
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
    setEditId(null); loadMissions();
  }

  async function deleteEdit(){
    if(!editId)return;
    Alert.alert('Supprimer ?','Cette mission sera définitivement supprimée.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        const { error,count }=await supabase.from('missions').delete({count:'exact'}).eq('id',editId);
        if(error){ Alert.alert('Erreur',error.message); return; }
        if(count===0){ Alert.alert('Bloqué','Suppression refusée (droits Supabase).'); return; }
        setEditId(null); setSelected(null); loadMissions();
      }},
    ]);
  }

  const filtered=missions.filter((m:any)=>{
    const y=new Date(m.mission_date+'T00:00:00').getFullYear();
    if(period==='year')return y===new Date().getFullYear();
    if(period==='custom')return y===customYear;
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
    name, list:groups[name], color:COLORS[i%COLORS.length],
    gross:groups[name].reduce((a:number,m:any)=>a+Number(m.gross_amount||0),0),
    hours:Math.round(groups[name].reduce((a:number,m:any)=>a+Number(m.hours||0),0)*10)/10,
    vac:groups[name].reduce((a:number,m:any)=>a+Number(m.vacations||Math.round(Number(m.hours||0)/8)),0),
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
            <TouchableOpacity key={m.id} style={s.missionCard} onPress={()=>openEdit(m)}>
              <View style={s.missionHead}>
                <Text style={s.missionProd} numberOfLines={1}>{m.production}</Text>
                <View style={s.pill}><Text style={s.pillTxt}>{m.mission_type}</Text></View>
              </View>
              <View style={{gap:4,marginTop:8}}>
                {m.emission?<Text style={s.meta}>🎬 {m.emission}</Text>:null}
                <Text style={s.meta}>📅 {fmtPeriod(m.mission_date,m.end_date)}</Text>
                <Text style={s.meta}>🕒 {m.hours}h · 💼 {m.vacations||Math.round(Number(m.hours||0)/8)} vacation(s)</Text>
                <Text style={s.meta}>€ {money(m.gross_amount)}</Text>
              </View>
              <Text style={s.tapHint}>Toucher pour modifier</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Modal visible={!!editId} animationType="slide" transparent onRequestClose={()=>setEditId(null)}>
          <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.modalTitle}>Modifier la mission</Text>

                <Text style={s.label}>Nom de la production</Text>
                <TextInput style={s.input} value={fProduction} onChangeText={(t:string)=>{setFProduction(t);setShowSuggest(true);}} onFocus={()=>setShowSuggest(true)} placeholderTextColor={C.muted} autoCapitalize="characters"/>
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
                <TextInput style={s.input} value={fEmission} onChangeText={(t:string)=>{setFEmission(t);setShowEmSuggest(true);}} onFocus={()=>setShowEmSuggest(true)} placeholder="Ex : Koh-Lanta" placeholderTextColor={C.muted}/>
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
        <TouchableOpacity style={[s.periodChip,period==='year'&&s.periodOn]} onPress={()=>setPeriod('year')}>
          <Text style={period==='year'?s.periodTxtOn:s.periodTxt}>Cette année</Text>
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

      <View style={s.statsRow}>
        <View style={s.statBox}><Text style={s.statVal}>{totalVac}</Text><Text style={s.statLbl}>VACATIONS</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{totalHours}h</Text><Text style={s.statLbl}>HEURES</Text></View>
        <View style={[s.statBox,s.statHL]}><Text style={[s.statVal,{color:'white'}]}>{money(totalGross)}</Text><Text style={[s.statLbl,{color:'rgba(255,255,255,.7)'}]}>BRUT TOTAL</Text></View>
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

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:C.bg},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  pageHeader:{backgroundColor:'white',padding:18,paddingTop:52,borderBottomWidth:1,borderBottomColor:C.line},
  pageTitle:{fontSize:22,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  pageSub:{fontSize:13,color:C.muted,marginTop:4},
  periodBar:{flexDirection:'row',gap:8,paddingHorizontal:16,paddingTop:16},
  periodChip:{flex:1,paddingVertical:10,borderRadius:12,backgroundColor:C.card,borderWidth:1,borderColor:C.line,alignItems:'center'},
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
  detailHeader:{flexDirection:'row',alignItems:'center',gap:12,padding:16,paddingTop:52,backgroundColor:'white',borderBottomWidth:1,borderBottomColor:C.line},
  backBtn:{backgroundColor:C.soft,borderRadius:12,paddingVertical:8,paddingHorizontal:14},
  backBtnTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
  detailTitle:{fontSize:18,fontWeight:'900',color:C.petrol},
  detailSub:{fontSize:12,color:C.muted,marginTop:2},
  missionCard:{backgroundColor:C.card,borderRadius:16,padding:14,borderWidth:1,borderColor:'rgba(31,78,95,0.12)',borderLeftWidth:4,borderLeftColor:C.petrol},
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
  empty:{textAlign:'center',color:C.muted,padding:20},
});