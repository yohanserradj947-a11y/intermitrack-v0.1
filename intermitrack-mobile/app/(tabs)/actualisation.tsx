import { showAlert } from "../../lib/dialog";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { useTrackView } from '../../lib/analytics';
import { GradientButton } from '../../components/GradientButton';
import { useTheme } from '../../lib/theme';

// Palette fournie par le thème clair/sombre (voir lib/theme.tsx).

function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function monthLabel(d:Date){const l=d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});return l.charAt(0).toUpperCase()+l.slice(1);}

export default function Actualisation(){
  useTrackView('actualisation');
  const C=useTheme();
  const s=useMemo(()=>makeS(C),[C]);
  const [missions,setMissions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [current,setCurrent]=useState(new Date());
  const [generating,setGenerating]=useState(false);

  useEffect(()=>{loadMissions();},[]);
  useFocusEffect(useCallback(()=>{loadMissions(true);},[]));

  async function loadMissions(silent=false){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:true});
    if(data)setMissions(data);
    if(!silent)setLoading(false);
  }

  const month=current.getMonth(), year=current.getFullYear();

  const monthMissions=useMemo(()=>missions.filter((m:any)=>{
    const d=new Date(m.mission_date+'T00:00:00');
    return d.getMonth()===month && d.getFullYear()===year;
  }),[missions,month,year]);

  const totalHours=useMemo(()=>Math.round(monthMissions.reduce((a,m:any)=>a+Number(m.hours||0),0)*10)/10,[monthMissions]);
  const totalGross=useMemo(()=>monthMissions.reduce((a,m:any)=>a+Number(m.gross_amount||0),0),[monthMissions]);
  const totalVac=useMemo(()=>monthMissions.reduce((a,m:any)=>a+Number(m.vacations||Math.round(Number(m.hours||0)/8)),0),[monthMissions]);

  function moveMonth(n:number){const d=new Date(current);d.setMonth(d.getMonth()+n);d.setDate(1);setCurrent(d);}

  async function generatePDF(){
    if(monthMissions.length===0){ showAlert('Aucune mission','Aucune mission à déclarer ce mois-ci.'); return; }
    setGenerating(true);
    try{
      const rows=monthMissions.map((m:any)=>`
        <tr>
          <td>${fmtDate(m.mission_date)}${m.end_date?(' → '+fmtDate(m.end_date)):''}</td>
          <td>${m.production||''}</td>
          <td>${m.mission_type||''}</td>
          <td style="text-align:right">${m.hours||0}h</td>
          <td style="text-align:right">${money(Number(m.gross_amount||0))}</td>
        </tr>`).join('');
      const html=`
        <html><head><meta charset="utf-8"/>
        <style>
          body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#2D3748;padding:32px;}
          h1{color:#1F4E5F;font-size:24px;margin:0;}
          .sub{color:#718096;font-size:13px;margin-top:4px;}
          .totals{display:flex;gap:12px;margin:24px 0;}
          .box{flex:1;border:1px solid #E2E8F0;border-radius:12px;padding:14px;}
          .box .v{font-size:22px;font-weight:800;color:#1F4E5F;}
          .box .l{font-size:11px;color:#718096;text-transform:uppercase;}
          table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;}
          th{background:#1F4E5F;color:white;padding:8px;text-align:left;font-size:12px;}
          td{padding:8px;border-bottom:1px solid #E2E8F0;}
          .foot{margin-top:24px;font-size:11px;color:#718096;}
        </style></head>
        <body>
          <h1>Intermitrack — Actualisation</h1>
          <div class="sub">Récapitulatif des missions · ${monthLabel(current)}</div>
          <div class="totals">
            <div class="box"><div class="v">${monthMissions.length}</div><div class="l">Missions</div></div>
            <div class="box"><div class="v">${totalHours}h</div><div class="l">Heures</div></div>
            <div class="box"><div class="v">${totalVac}</div><div class="l">Vacations</div></div>
            <div class="box"><div class="v">${money(totalGross)}</div><div class="l">Brut total</div></div>
          </div>
          <table>
            <thead><tr><th>Période</th><th>Production</th><th>Type</th><th style="text-align:right">Heures</th><th style="text-align:right">Brut</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="foot">Document généré par Intermitrack le ${new Date().toLocaleDateString('fr-FR')}. Récapitulatif indicatif à vérifier avant toute déclaration officielle.</div>
        </body></html>`;
      const { uri }=await Print.printToFileAsync({ html });
      if(await Sharing.isAvailableAsync()){
        await Sharing.shareAsync(uri,{ mimeType:'application/pdf', dialogTitle:'Actualisation '+monthLabel(current) });
      }else{
        showAlert('PDF généré','Le PDF a été créé mais le partage n\'est pas disponible sur cet appareil.');
      }
    }catch(e:any){
      showAlert('Erreur',e.message||'Impossible de générer le PDF.');
    }
    setGenerating(false);
  }

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.header}>
        <Text style={s.title}>Actualisation</Text>
        <Text style={s.sub}>Récapitulatif à utiliser pour ton actualisation France Travail.</Text>
      </View>

      <View style={s.monthNav}>
        <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(-1)}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
        <Text style={s.monthLbl}>{monthLabel(current)}</Text>
        <TouchableOpacity style={s.navBtn} onPress={()=>moveMonth(1)}><Text style={s.navTxt}>›</Text></TouchableOpacity>
      </View>

      <View style={s.statsGrid}>
        <View style={s.statBox}><Text style={s.statVal}>{monthMissions.length}</Text><Text style={s.statLbl}>Missions</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{totalHours}h</Text><Text style={s.statLbl}>Heures</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{totalVac}</Text><Text style={s.statLbl}>Vacations</Text></View>
        <View style={[s.statBox,{borderColor:C.petrol,borderWidth:1}]}><Text style={s.statVal}>{money(totalGross)}</Text><Text style={s.statLbl}>Brut total</Text></View>
      </View>

      <GradientButton onPress={generatePDF} disabled={generating} style={s.pdfBtn} textStyle={s.pdfBtnTxt} label={generating?'Génération…':'Générer le PDF'} />

      <Text style={s.listTitle}>Détail des missions</Text>
      <View style={{paddingHorizontal:16,gap:10}}>
        {monthMissions.length===0
          ?<Text style={s.empty}>Aucune mission ce mois-ci.</Text>
          :monthMissions.map((m:any)=>(
            <View key={m.id} style={s.row}>
              <View style={{flex:1}}>
                <Text style={s.rProd}>{m.production}</Text>
                <Text style={s.rDate}>{fmtDate(m.mission_date)} · {m.mission_type}</Text>
              </View>
              <View style={{alignItems:'flex-end'}}>
                <Text style={s.rGross}>{money(m.gross_amount)}</Text>
                <Text style={s.rHours}>{m.hours}h</Text>
              </View>
            </View>
          ))
        }
      </View>
    </ScrollView>
  );
}

const makeS=(C:any)=>StyleSheet.create({
  container:{flex:1,backgroundColor:'transparent'},
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg},
  header:{backgroundColor:C.card,padding:18,paddingTop:52,borderBottomWidth:1,borderBottomColor:C.line},
  title:{fontSize:24,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  sub:{fontSize:13,color:C.muted,marginTop:4},
  monthNav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,margin:16},
  navBtn:{width:42,height:42,borderRadius:21,backgroundColor:C.soft,justifyContent:'center',alignItems:'center'},
  navTxt:{fontSize:22,fontWeight:'900',color:C.petrol,lineHeight:24},
  monthLbl:{flex:1,textAlign:'center',fontSize:15,fontWeight:'800',color:C.petrol,backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:12},
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,paddingHorizontal:16},
  statBox:{width:'47%',backgroundColor:C.card,borderRadius:14,padding:14,alignItems:'center',shadowColor:'#000',shadowOpacity:0.04,shadowRadius:6,elevation:2},
  statVal:{fontSize:18,fontWeight:'900',color:C.petrol},
  statLbl:{fontSize:10,color:C.muted,fontWeight:'700',marginTop:3,textTransform:'uppercase'},
  pdfBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:15,alignItems:'center',margin:16},
  pdfBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  listTitle:{fontSize:17,fontWeight:'900',color:C.petrol,marginHorizontal:16,marginBottom:10},
  empty:{textAlign:'center',color:C.muted,padding:20},
  row:{backgroundColor:C.card,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:C.line},
  rProd:{fontSize:14,fontWeight:'900',color:C.petrol,textTransform:'uppercase'},
  rDate:{fontSize:12,color:C.muted,marginTop:3},
  rGross:{fontSize:15,fontWeight:'900',color:C.petrol},
  rHours:{fontSize:12,color:C.orange,fontWeight:'700',marginTop:2},
});