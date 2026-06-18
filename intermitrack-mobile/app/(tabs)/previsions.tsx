import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { ajBrute, ajNet, carence, congesSpectacles, etalementCarence, netAPayer, CHARGE_DEFAUT, CONFIG } from '../../lib/calcul';
import NumInput from '../../components/NumInput';

const C = { petrol:'#1F4E5F', sage:'#7A9E7E', bg:'#F5F7F6', card:'#FFFFFF', text:'#2D3748', muted:'#718096', line:'#E2E8F0', soft:'#EEF4F1', orange:'#F97316' };

function eur(n:number){return(n??0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function num(v:string){if(!v)return NaN;return parseFloat(String(v).replace(/\s/g,'').replace(',','.'));}

export default function Previsions(){
  const [missions,setMissions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);

  const [c1Annexe,setC1Annexe]=useState<'technicien'|'artiste'>('technicien');
  const [c1Nht,setC1Nht]=useState('');
  const [c1Sr,setC1Sr]=useState('');
  const [c1Csg,setC1Csg]=useState<'plein'|'reduit'|'exonere'>('plein');
  const [c1Res,setC1Res]=useState<any>(null);

  const [c2Nht,setC2Nht]=useState('');
  const [c2Prc,setC2Prc]=useState('');
  const [c2Jours,setC2Jours]=useState('');
  const [c2Annexe,setC2Annexe]=useState<'technicien'|'artiste'>('technicien');
  const [c2Deja,setC2Deja]=useState(false);
  const [c2Mois,setC2Mois]=useState(new Date().getMonth());
  const [c2Res,setC2Res]=useState<any>(null);

  const [c3Brut,setC3Brut]=useState('');
  const [c3Res,setC3Res]=useState<any>(null);

  // Carte 4 — net à payer d'une mission
  const [c4Statut,setC4Statut]=useState<'technicien'|'musicien'|'artiste'>('technicien');
  const [c4Brut,setC4Brut]=useState('');
  const [c4Charge,setC4Charge]=useState('22,5');
  const [c4Pas,setC4Pas]=useState('');
  const [c4Res,setC4Res]=useState<any>(null);

  useEffect(()=>{loadMissions();loadTaux();},[]);
  useFocusEffect(useCallback(()=>{loadMissions();},[]));
  async function loadMissions(){
    const{data}=await supabase.from('missions').select('*');
    if(data)setMissions(data);
    setLoading(false);
  }
  async function loadTaux(){
    const ch=await AsyncStorage.getItem('intermitrack_charge_rate');
    const pas=await AsyncStorage.getItem('intermitrack_pas_rate');
    if(ch!==null)setC4Charge(String(ch).replace('.',','));
    if(pas!==null&&Number(pas)>0)setC4Pas(String(pas).replace('.',','));
  }

  const today=new Date();today.setHours(0,0,0,0);
  const doneH=Math.round(missions.filter((m:any)=>new Date((m.end_date||m.mission_date)+'T00:00:00')<today)
    .reduce((a,m:any)=>a+Number(m.hours||0),0)*10)/10;
  const remaining=Math.max(0,Math.round((CONFIG.NH-doneH)*10)/10);
  const pct=Math.min(100,Math.round((doneH/CONFIG.NH)*100));

  function calcC1(){
    const nht=num(c1Nht), sr=num(c1Sr);
    if(!(nht>0)||!(sr>0)){setC1Res({err:true});return;}
    const k=c1Annexe==='artiste'?CONFIG.ARTISTE:CONFIG.TECHNICIEN;
    const brute=ajBrute(c1Annexe,nht,sr);
    const d=ajNet(brute,c1Csg);
    const proj=[1,2,3].map(i=>{
      const h=Math.round((nht+i*100)/100)*100;
      return { h, net:ajNet(ajBrute(c1Annexe,h,sr),c1Csg).net };
    });
    setC1Res({brute,net:d.net,sjr:sr/(nht/k.jourH),exempt:d.exempt,proj});
  }
  function calcC2(){
    const nht=num(c2Nht), prc=num(c2Prc), jours=num(c2Jours);
    if(!(nht>0)||!(prc>0)||!(jours>0)){setC2Res({err:true});return;}
    const res=carence(nht,prc,jours,c2Annexe,c2Deja);
    const tableau=etalementCarence(res.delai,res.franchiseSal,res.franchiseCP,c2Mois);
    setC2Res({...res,tableau});
  }
  function calcC3(){
    const b=num(c3Brut);
    if(!(b>0)){setC3Res({err:true});return;}
    setC3Res(congesSpectacles(b));
  }
  function pickC4Statut(st:'technicien'|'musicien'|'artiste'){
    setC4Statut(st);
    setC4Charge(String(CHARGE_DEFAUT[st]??22.5).replace('.',',')); // pré-remplit le taux de charges
  }
  async function calcC4(){
    const brut=num(c4Brut);
    let charge=num(c4Charge), pas=num(c4Pas);
    if(!(brut>0)){setC4Res({err:true});return;}
    if(!(charge>=0))charge=0;
    if(!(pas>=0))pas=0;
    await AsyncStorage.setItem('intermitrack_charge_rate',String(charge)); // réutilisé par le tableau de bord
    await AsyncStorage.setItem('intermitrack_pas_rate',String(pas));
    setC4Res({...netAPayer(brut,charge,pas),charge,pas});
  }

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.header}>
        <Text style={s.title}>Prévisions</Text>
        <Text style={s.sub}>Estimations indicatives. Ne remplacent pas les calculs officiels France Travail.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Réouverture des droits</Text>
        <Text style={s.cardSub}>Avancement vers les 507 h (heures effectuées).</Text>
        <View style={s.progressTrack}><View style={[s.progressFill,{width:`${pct}%`}]}/></View>
        <View style={s.row2}>
          <Text style={s.bigVal}>{doneH}h</Text>
          <Text style={s.bigValMuted}>{remaining}h restantes</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Taux journalier (AJ)</Text>
        <Text style={s.cardSub}>Simulation indicative de l'allocation journalière.</Text>
        <View style={s.toggleRow}>
          {(['technicien','artiste'] as const).map(a=>(
            <TouchableOpacity key={a} style={[s.toggle,c1Annexe===a&&s.toggleOn]} onPress={()=>setC1Annexe(a)}>
              <Text style={c1Annexe===a?s.toggleTxtOn:s.toggleTxt}>{a==='technicien'?'Technicien (8h)':'Artiste (12h)'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.label}>Nombre d'heures travaillées</Text>
        <NumInput style={s.input} value={c1Nht} onChangeText={setC1Nht} placeholder="507" placeholderTextColor={C.muted}/>
        <Text style={s.label}>Salaire de référence brut (€)</Text>
        <NumInput style={s.input} value={c1Sr} onChangeText={setC1Sr} placeholder="20000" placeholderTextColor={C.muted}/>
        <Text style={s.label}>Taux CSG</Text>
        <View style={s.toggleRow}>
          {(['plein','reduit','exonere'] as const).map(t=>(
            <TouchableOpacity key={t} style={[s.toggle,c1Csg===t&&s.toggleOn]} onPress={()=>setC1Csg(t)}>
              <Text style={c1Csg===t?s.toggleTxtOn:s.toggleTxt}>{t==='plein'?'Plein':t==='reduit'?'Réduit':'Exonéré'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.calcBtn} onPress={calcC1}><Text style={s.calcBtnTxt}>Calculer</Text></TouchableOpacity>
        {c1Res?.err&&<Text style={s.err}>Renseigne les heures et le salaire de référence.</Text>}
        {c1Res&&!c1Res.err&&(
          <View style={s.result}>
            <View style={s.resRow}><Text style={s.resLbl}>AJ nette / jour</Text><Text style={s.resVal}>{eur(c1Res.net)}</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>AJ brute</Text><Text style={s.resValSm}>{eur(c1Res.brute)}</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>SJR</Text><Text style={s.resValSm}>{eur(c1Res.sjr)}</Text></View>
            {c1Res.exempt&&<Text style={s.note}>CSG/CRDS exonérées : allocation sous le SMIC journalier.</Text>}
            {c1Res.proj&&(
              <View style={s.proj}>
                <Text style={s.projTitle}>Si tu travailles plus :</Text>
                {c1Res.proj.map((p:any)=>(
                  <View key={p.h} style={s.resRow}>
                    <Text style={s.resLbl}>{p.h} h</Text>
                    <Text style={s.resValSm}>{eur(p.net)} / j net</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Franchises / carences (Annexe 8)</Text>
        <Text style={s.cardSub}>Estimation des jours de carence avant versement de l'ARE.</Text>
        <View style={s.toggleRow}>
          {(['technicien','artiste'] as const).map(a=>(
            <TouchableOpacity key={a} style={[s.toggle,c2Annexe===a&&s.toggleOn]} onPress={()=>setC2Annexe(a)}>
              <Text style={c2Annexe===a?s.toggleTxtOn:s.toggleTxt}>{a==='technicien'?'Technicien':'Artiste'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.label}>Nombre d'heures travaillées</Text>
        <NumInput style={s.input} value={c2Nht} onChangeText={setC2Nht} placeholder="507" placeholderTextColor={C.muted}/>
        <Text style={s.label}>Salaire brut de référence (€)</Text>
        <NumInput style={s.input} value={c2Prc} onChangeText={setC2Prc} placeholder="20000" placeholderTextColor={C.muted}/>
        <Text style={s.label}>Jours travaillés</Text>
        <NumInput style={s.input} value={c2Jours} onChangeText={setC2Jours} placeholder="0" placeholderTextColor={C.muted}/>
        <Text style={s.label}>Mois de début</Text>
        <View style={s.monthGrid}>
          {['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'].map((m,i)=>(
            <TouchableOpacity key={i} style={[s.monthChip,c2Mois===i&&s.toggleOn]} onPress={()=>setC2Mois(i)}>
              <Text style={c2Mois===i?s.toggleTxtOn:s.toggleTxt}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.calcBtn} onPress={calcC2}><Text style={s.calcBtnTxt}>Calculer</Text></TouchableOpacity>
        {c2Res?.err&&<Text style={s.err}>Renseigne les heures, le brut et les jours travaillés.</Text>}
        {c2Res&&!c2Res.err&&(
          <View style={s.result}>
            <View style={s.resRow}><Text style={s.resLbl}>Total carence</Text><Text style={s.resVal}>{c2Res.total} j</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>Délai d'attente</Text><Text style={s.resValSm}>{c2Res.delai} j</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>Franchise salaires</Text><Text style={s.resValSm}>{c2Res.franchiseSal} j</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>Franchise congés</Text><Text style={s.resValSm}>{c2Res.franchiseCP} j</Text></View>
            {c2Res.tableau&&c2Res.tableau.length>0&&(
              <View style={s.table}>
                <Text style={s.projTitle}>Étalement mois par mois</Text>
                <View style={s.tHead}>
                  <Text style={[s.tCell,s.tCellMois,s.tHeadTxt]}>Mois</Text>
                  <Text style={[s.tCell,s.tHeadTxt]}>Délai</Text>
                  <Text style={[s.tCell,s.tHeadTxt]}>F.Sal</Text>
                  <Text style={[s.tCell,s.tHeadTxt]}>F.CP</Text>
                  <Text style={[s.tCell,s.tHeadTxt]}>Tot.</Text>
                  <Text style={[s.tCell,s.tHeadTxt]}>Cumul</Text>
                </View>
                {c2Res.tableau.map((l:any,i:number)=>(
                  <View key={i} style={s.tRow}>
                    <Text style={[s.tCell,s.tCellMois]}>{l.mois}</Text>
                    <Text style={s.tCell}>{l.delai||'—'}</Text>
                    <Text style={s.tCell}>{l.fsal||'—'}</Text>
                    <Text style={s.tCell}>{l.fcp||'—'}</Text>
                    <Text style={[s.tCell,{fontWeight:'800'}]}>{l.total}</Text>
                    <Text style={s.tCell}>{l.cumul}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Congés Spectacles</Text>
        <Text style={s.cardSub}>Estimation indicative (≈ 10 % du brut).</Text>
        <Text style={s.label}>Brut annuel (€)</Text>
        <NumInput style={s.input} value={c3Brut} onChangeText={setC3Brut} placeholder="20000" placeholderTextColor={C.muted}/>
        <TouchableOpacity style={s.calcBtn} onPress={calcC3}><Text style={s.calcBtnTxt}>Calculer</Text></TouchableOpacity>
        {c3Res?.err&&<Text style={s.err}>Renseigne ton brut annuel.</Text>}
        {c3Res&&!c3Res.err&&(
          <View style={s.result}>
            <View style={s.resRow}><Text style={s.resLbl}>Estimation nette</Text><Text style={s.resVal}>{eur(c3Res.net)}</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>Brut congés</Text><Text style={s.resValSm}>{eur(c3Res.brut)}</Text></View>
          </View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Net à payer d'une mission</Text>
        <Text style={s.cardSub}>Du brut à ce qui tombe sur ton compte. Taux modifiables — estimation indicative.</Text>
        <View style={s.toggleRow}>
          {(['technicien','musicien','artiste'] as const).map(st=>(
            <TouchableOpacity key={st} style={[s.toggle,c4Statut===st&&s.toggleOn]} onPress={()=>pickC4Statut(st)}>
              <Text style={c4Statut===st?s.toggleTxtOn:s.toggleTxt}>{st==='technicien'?'Technicien':st==='musicien'?'Musicien':'Artiste'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.label}>Salaire brut de la mission (€)</Text>
        <NumInput style={s.input} value={c4Brut} onChangeText={setC4Brut} placeholder="1000" placeholderTextColor={C.muted}/>
        <Text style={s.label}>Charges salariales (%)</Text>
        <NumInput style={s.input} value={c4Charge} onChangeText={setC4Charge} placeholder="22,5" placeholderTextColor={C.muted}/>
        <Text style={s.label}>Prélèvement à la source (%)</Text>
        <NumInput style={s.input} value={c4Pas} onChangeText={setC4Pas} placeholder="0" placeholderTextColor={C.muted}/>
        <Text style={s.note}>Ton taux perso (impots.gouv.fr / fiche de paie). Laisse vide si tu ne le connais pas.</Text>
        <TouchableOpacity style={s.calcBtn} onPress={calcC4}><Text style={s.calcBtnTxt}>Calculer</Text></TouchableOpacity>
        {c4Res?.err&&<Text style={s.err}>Renseigne le brut de la mission.</Text>}
        {c4Res&&!c4Res.err&&(
          <View style={s.result}>
            <View style={s.resRow}><Text style={s.resLbl}>Net à payer estimé</Text><Text style={s.resVal}>{eur(c4Res.net)}</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>Brut</Text><Text style={s.resValSm}>{eur(c4Res.brut)}</Text></View>
            <View style={s.resRow}><Text style={s.resLbl}>Net avant impôt</Text><Text style={s.resValSm}>{eur(c4Res.netImp)}</Text></View>
            <Text style={s.note}>− charges {String(c4Res.charge).replace('.',',')} % ({eur(c4Res.charges)}) − prélèvement {String(c4Res.pas).replace('.',',')} % ({eur(c4Res.impot)}). Estimation indicative.</Text>
          </View>
        )}
      </View>

      <Text style={s.footer}>Tous les montants sont strictement indicatifs. Aucun calcul officiel France Travail n'est remplacé par Intermitrack.</Text>
    </ScrollView>
  );
}

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:C.bg},
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg},
  header:{backgroundColor:'white',padding:18,paddingTop:52,borderBottomWidth:1,borderBottomColor:C.line},
  title:{fontSize:24,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  sub:{fontSize:13,color:C.muted,marginTop:4},
  card:{backgroundColor:C.card,borderRadius:18,padding:16,margin:16,marginBottom:0,borderWidth:1,borderColor:C.line},
  cardTitle:{fontSize:16,fontWeight:'900',color:C.petrol},
  cardSub:{fontSize:12,color:C.muted,marginTop:2,marginBottom:12},
  label:{fontSize:13,fontWeight:'700',color:C.text,marginTop:10,marginBottom:6},
  input:{borderWidth:1,borderColor:C.line,borderRadius:12,paddingVertical:12,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:'#F8FAF9'},
  toggleRow:{flexDirection:'row',gap:8,marginTop:8,flexWrap:'wrap'},
  toggle:{flex:1,minWidth:80,paddingVertical:10,borderRadius:12,backgroundColor:C.soft,alignItems:'center'},
  toggleOn:{backgroundColor:C.petrol},
  toggleTxt:{fontSize:12,fontWeight:'700',color:C.petrol},
  toggleTxtOn:{fontSize:12,fontWeight:'700',color:'white'},
  calcBtn:{backgroundColor:C.petrol,borderRadius:13,paddingVertical:13,alignItems:'center',marginTop:14},
  calcBtnTxt:{color:'white',fontWeight:'800',fontSize:14},
  err:{fontSize:12,color:C.orange,fontWeight:'700',marginTop:10,textAlign:'center'},
  result:{marginTop:14,backgroundColor:C.soft,borderRadius:12,padding:14,gap:8},
  resRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  resLbl:{fontSize:13,color:C.muted,fontWeight:'600'},
  resVal:{fontSize:18,fontWeight:'900',color:C.petrol},
  resValSm:{fontSize:14,fontWeight:'700',color:C.text},
  note:{fontSize:11,color:C.muted,fontStyle:'italic',marginTop:4},
  proj:{marginTop:10,borderTopWidth:1,borderTopColor:C.line,paddingTop:10,gap:8},
  projTitle:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase'},
  monthGrid:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},
  monthChip:{width:'15%',paddingVertical:8,borderRadius:9,backgroundColor:C.soft,alignItems:'center'},
  table:{marginTop:12,borderTopWidth:1,borderTopColor:C.line,paddingTop:10},
  tHead:{flexDirection:'row',marginTop:6,paddingBottom:6,borderBottomWidth:1,borderBottomColor:C.line},
  tRow:{flexDirection:'row',paddingVertical:6,borderBottomWidth:1,borderBottomColor:'rgba(0,0,0,0.04)'},
  tCell:{flex:1,fontSize:11,color:C.text,textAlign:'center'},
  tCellMois:{flex:1.4,textAlign:'left',textTransform:'capitalize'},
  tHeadTxt:{fontWeight:'800',color:C.muted,fontSize:10},
  progressTrack:{height:14,borderRadius:99,backgroundColor:C.soft,overflow:'hidden',marginTop:8},
  progressFill:{height:14,borderRadius:99,backgroundColor:C.sage},
  row2:{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline',marginTop:10},
  bigVal:{fontSize:26,fontWeight:'900',color:C.petrol},
  bigValMuted:{fontSize:15,fontWeight:'700',color:C.orange},
  footer:{fontSize:11,color:C.muted,fontStyle:'italic',textAlign:'center',margin:16,marginTop:20},
});