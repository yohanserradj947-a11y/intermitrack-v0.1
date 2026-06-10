import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

const C = { petrol:'#1F4E5F', sage:'#7A9E7E', bg:'#F5F7F6', card:'#FFFFFF', text:'#2D3748', muted:'#718096', line:'#E2E8F0', soft:'#EEF4F1', orange:'#F97316' };
const COLORS = ['#1F4E5F','#2A6174','#3A7A8F','#7A9E7E','#8AB08E','#9AC09E','#F97316','#FDBA74','#4A8FA5','#5A9FB5'];

function money(n:number){return(n??0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
function fmtDate(d:string){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function fmtPeriod(s:string,e:string){if(!e||e===s)return fmtDate(s);return fmtDate(s)+' → '+fmtDate(e);}

export default function Missions(){
  const [missions,setMissions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<string|null>(null);

  useEffect(()=>{loadMissions();},[]);

  async function loadMissions(){
    const{data}=await supabase.from('missions').select('*').order('mission_date',{ascending:false});
    if(data)setMissions(data);
    setLoading(false);
  }

  const groups:{[key:string]:any[]}={};
  missions.forEach((m:any)=>{
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
            <View key={m.id} style={s.missionCard}>
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
              <View style={s.missionActions}>
                <TouchableOpacity style={s.editBtn} onPress={()=>alert('Modifier — bientôt disponible')}>
                  <Text style={s.editBtnTxt}>✏️ Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={async()=>{
                  await supabase.from('missions').delete().eq('id',m.id);
                  loadMissions();
                  setSelected(null);
                }}>
                  <Text style={s.deleteBtnTxt}>🗑️ Supprimer</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>🎬 Mes missions</Text>
        <Text style={s.pageSub}>Répartition du brut par production</Text>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statBox}><Text style={s.statVal}>{totalVac}</Text><Text style={s.statLbl}>VACATIONS</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{totalHours}h</Text><Text style={s.statLbl}>HEURES</Text></View>
        <View style={[s.statBox,s.statHL]}><Text style={[s.statVal,{color:'white'}]}>{money(totalGross)}</Text><Text style={[s.statLbl,{color:'rgba(255,255,255,.7)'}]}>BRUT TOTAL</Text></View>
        <View style={s.statBox}><Text style={s.statVal}>{sorted.length}</Text><Text style={s.statLbl}>PROD.</Text></View>
      </View>

      {/* Graphique barres */}
      {totalGross>0&&(
        <View style={g.wrap}>
          <View style={g.barRow}>
            {sorted.map((p)=>(
              <View key={p.name} style={[g.seg,{flex:p.gross/totalGross,backgroundColor:p.color}]}/>
            ))}
          </View>
          <View style={g.center}>
            <Text style={g.total}>{money(totalGross)}</Text>
            <Text style={g.sub}>brut total</Text>
          </View>
        </View>
      )}

      {/* Liste productions cliquables */}
      <View style={{paddingHorizontal:16,gap:8}}>
        {sorted.map((p)=>(
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
        ))}
      </View>
    </ScrollView>
  );
}

const g=StyleSheet.create({
  wrap:{marginHorizontal:16,backgroundColor:C.card,borderRadius:18,padding:16,borderWidth:1,borderColor:C.line,marginBottom:8,shadowColor:C.petrol,shadowOpacity:0.06,shadowRadius:12,elevation:2},
  barRow:{flexDirection:'row',height:28,borderRadius:99,overflow:'hidden',marginBottom:14},
  seg:{},
  center:{alignItems:'center'},
  total:{fontSize:22,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  sub:{fontSize:12,color:C.muted,marginTop:2},
});

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:C.bg},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  pageHeader:{backgroundColor:'white',padding:18,paddingTop:52,borderBottomWidth:1,borderBottomColor:C.line},
  pageTitle:{fontSize:22,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  pageSub:{fontSize:13,color:C.muted,marginTop:4},
  statsRow:{flexDirection:'row',padding:16,gap:8},
  statBox:{flex:1,backgroundColor:C.card,borderRadius:14,padding:10,alignItems:'center',shadowColor:'#000',shadowOpacity:0.04,shadowRadius:6,elevation:2},
  statHL:{backgroundColor:C.petrol},
  statVal:{fontSize:14,fontWeight:'900',color:C.petrol,textAlign:'center'},
  statLbl:{fontSize:8,color:C.muted,fontWeight:'700',marginTop:3,textTransform:'uppercase',textAlign:'center'},
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
  missionActions:{flexDirection:'row',gap:8,marginTop:12},
  editBtn:{flex:1,backgroundColor:C.soft,borderRadius:10,paddingVertical:9,alignItems:'center'},
  editBtnTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
  deleteBtn:{flex:1,backgroundColor:'#FFF5F5',borderRadius:10,paddingVertical:9,alignItems:'center'},
  deleteBtnTxt:{fontSize:13,fontWeight:'800',color:'#E53E3E'},
});

