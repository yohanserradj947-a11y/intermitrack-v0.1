import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert, Linking, Platform, KeyboardAvoidingView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTrackView } from '../../lib/analytics';
import NumInput from '../../components/NumInput';
import { GradientButton } from '../../components/GradientButton';

const C = { petrol:'#1F4E5F', sage:'#7A9E7E', bg:'#F5F7F6', card:'#FFFFFF', text:'#2D3748', muted:'#718096', line:'#E2E8F0', soft:'#EEF4F1', orange:'#F97316' };
const TYPES = ['AEM','Fiche de paie','Congés Spectacles','Contrat','Autre'];
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function safeFileName(name:string){
  return String(name||'document').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,90);
}

export default function Documents(){
  useTrackView('documents');
  const insets=useSafeAreaInsets();
  const [docs,setDocs]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [openProd,setOpenProd]=useState<string|null>(null);
  const [filter,setFilter]=useState('Tous');

  const [showForm,setShowForm]=useState(false);
  const [fType,setFType]=useState('Fiche de paie');
  const [fProd,setFProd]=useState('');
  const [fMonth,setFMonth]=useState(new Date().getMonth()+1);
  const [fYear,setFYear]=useState(new Date().getFullYear());
  const [fFile,setFFile]=useState<any>(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{loadDocs();},[]);
  // Si le dossier ouvert n'a plus aucun document (ex : on vient de supprimer le
  // dernier), on revient proprement à la liste des dossiers.
  useEffect(()=>{
    if(openProd && !docs.some((d:any)=>(d.production||'SANS PRODUCTION').toUpperCase()===openProd)){
      setOpenProd(null);
    }
  },[docs,openProd]);
  async function loadDocs(){
    const{data}=await supabase.from('documents').select('*')
      .order('doc_year',{ascending:false}).order('doc_month',{ascending:false});
    if(data)setDocs(data);
    setLoading(false);
  }

  async function pickFile(){
    const res=await DocumentPicker.getDocumentAsync({ type:['application/pdf','image/*'], copyToCacheDirectory:true });
    if(!res.canceled && res.assets && res.assets[0]){ setFFile(res.assets[0]); }
  }

  async function saveDoc(){
    if(!fProd.trim()){ Alert.alert('Production manquante','Indique la production.'); return; }
    if(!fFile){ Alert.alert('Fichier manquant','Choisis un PDF ou une image.'); return; }
    setSaving(true);
    try{
      const { data:{ user } } = await supabase.auth.getUser();
      if(!user) throw new Error('Tu n\'es plus connecté.');
      const clean=safeFileName(fFile.name);
      const path=`${user.id}/${fYear}/${String(fMonth).padStart(2,'0')}/${Date.now()}_${clean}`;
      const response=await fetch(fFile.uri);
      const blob=await response.arrayBuffer();
      const { error:upErr }=await supabase.storage.from('documents').upload(path,blob,{ contentType:fFile.mimeType||'application/octet-stream', upsert:false });
      if(upErr) throw new Error('Upload : '+upErr.message);
      const { error:insErr }=await supabase.from('documents').insert({
        user_id:user.id, file_name:fFile.name, file_path:path,
        document_type:fType, production:fProd.trim().toUpperCase(),
        doc_month:fMonth, doc_year:fYear, mime_type:fFile.mimeType||null,
      });
      if(insErr){ await supabase.storage.from('documents').remove([path]); throw new Error('Sauvegarde : '+insErr.message); }
      setShowForm(false); setFFile(null); setFProd('');
      loadDocs();
    }catch(e:any){ Alert.alert('Erreur',e.message); }
    setSaving(false);
  }

  async function openDoc(path:string){
    const { data,error }=await supabase.storage.from('documents').createSignedUrl(path,120);
    if(error||!data){ Alert.alert('Erreur',error?.message||'Impossible d\'ouvrir.'); return; }
    Linking.openURL(data.signedUrl);
  }

 async function deleteDoc(id:string,path:string){
    Alert.alert('Supprimer ?','Ce document sera définitivement supprimé.',[
      {text:'Annuler',style:'cancel'},
      {text:'Supprimer',style:'destructive',onPress:async()=>{
        try{
          const { error:stErr }=await supabase.storage.from('documents').remove([path]);
          if(stErr) console.log('Storage remove:',stErr.message);
          const { error:dbErr }=await supabase.from('documents').delete().eq('id',id);
          if(dbErr){ Alert.alert('Erreur','Suppression impossible : '+dbErr.message); return; }
          loadDocs();
        }catch(e:any){
          Alert.alert('Erreur',e?.message||'Une erreur est survenue lors de la suppression.');
        }
      }},
    ]);
  }

  const groups:{[k:string]:any[]}={};
  docs.forEach((d:any)=>{ const k=(d.production||'SANS PRODUCTION').toUpperCase(); if(!groups[k])groups[k]=[]; groups[k].push(d); });
  const prodNames=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fr'));

  if(loading)return<View style={s.center}><ActivityIndicator size="large" color={C.petrol}/></View>;

  return(
    <ScrollView style={s.container} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.header}>
        <Text style={s.title}>Documents</Text>
        <Text style={s.sub}>Tes papiers importants, toujours sous la main.</Text>
      </View>

      <GradientButton onPress={()=>setShowForm(true)} style={s.addBtn} textStyle={s.addBtnTxt} label="＋ Ajouter un document" />

      {(!openProd||!groups[openProd])?(
        <View style={{padding:16,gap:10}}>
          {prodNames.length===0
            ?<Text style={s.empty}>Aucun document enregistré pour le moment.</Text>
            :prodNames.map((p)=>(
              <TouchableOpacity key={p} style={s.folder} onPress={()=>{setOpenProd(p);setFilter('Tous');}}>
                <Text style={s.folderIcon}>📁</Text>
                <View style={{flex:1}}>
                  <Text style={s.folderName}>{p}</Text>
                  <Text style={s.folderSub}>{groups[p].length} document{groups[p].length>1?'s':''}</Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            ))
          }
        </View>
      ):(
        <View style={{padding:16,gap:10}}>
          <TouchableOpacity style={s.backBtn} onPress={()=>{setOpenProd(null);setFilter('Tous');}}>
            <Text style={s.backBtnTxt}>‹ Retour aux productions</Text>
          </TouchableOpacity>
          <Text style={s.prodTitle}>{openProd}</Text>
          <View style={s.filterBar}>
            {['Tous',...TYPES].map(f=>{
              const count=f==='Tous'?groups[openProd].length:groups[openProd].filter((d:any)=>d.document_type===f).length;
              if(f!=='Tous'&&count===0)return null;
              return(
                <TouchableOpacity key={f} style={[s.filterChip,filter===f&&s.chipOn]} onPress={()=>setFilter(f)}>
                  <Text style={filter===f?s.chipTxtOn:s.chipTxt}>{f}{f!=='Tous'?` · ${count}`:''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {groups[openProd].filter((d:any)=>filter==='Tous'||d.document_type===filter).map((d:any)=>(
            <View key={d.id} style={s.docCard}>
              <View style={s.docIcon}><Text style={s.docIconTxt}>{String(d.document_type||'DOC').slice(0,3).toUpperCase()}</Text></View>
              <View style={{flex:1}}>
                <Text style={s.docType}>{d.document_type}</Text>
                <Text style={s.docMeta}>{MOIS[d.doc_month-1]} {d.doc_year}</Text>
                <Text style={s.docName} numberOfLines={1}>{d.file_name}</Text>
              </View>
              <View style={s.docActions}>
                <TouchableOpacity style={s.openBtn} onPress={()=>openDoc(d.file_path)}><Text style={s.openBtnTxt}>Ouvrir</Text></TouchableOpacity>
                <TouchableOpacity style={s.delBtn} onPress={()=>deleteDoc(d.id,d.file_path)}><Text style={s.delBtnTxt}>Suppr.</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={()=>setShowForm(false)}>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={s.overlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Ajouter un document</Text>

              <Text style={s.label}>Type de document</Text>
              <View style={s.chipWrap}>
                {TYPES.map(t=>(
                  <TouchableOpacity key={t} style={[s.chip,fType===t&&s.chipOn]} onPress={()=>setFType(t)}>
                    <Text style={fType===t?s.chipTxtOn:s.chipTxt}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Production</Text>
              <TextInput style={s.input} value={fProd} onChangeText={setFProd} placeholder="Ex : ENDEMOL" placeholderTextColor={C.muted} autoCapitalize="characters"/>

              <Text style={s.label}>Mois</Text>
              <View style={s.monthGrid}>
                {MOIS.map((m,i)=>(
                  <TouchableOpacity key={i} style={[s.monthChip,fMonth===i+1&&s.chipOn]} onPress={()=>setFMonth(i+1)}>
                    <Text style={fMonth===i+1?s.chipTxtOn:s.chipTxt}>{m.slice(0,3)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Année</Text>
              <NumInput style={s.input} value={String(fYear)} onChangeText={(v:string)=>setFYear(Number(v)||new Date().getFullYear())}/>

              <Text style={s.label}>Fichier</Text>
              <TouchableOpacity style={s.fileBtn} onPress={pickFile}>
                <Text style={s.fileBtnTxt}>{fFile?`📎 ${fFile.name}`:'📎 Choisir un PDF ou une image'}</Text>
              </TouchableOpacity>

              <GradientButton onPress={saveDoc} disabled={saving} style={s.saveBtn} textStyle={s.saveBtnTxt} label={saving?'Envoi…':'Enregistrer le document'} />
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setShowForm(false)}>
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
  header:{backgroundColor:'white',padding:18,paddingTop:52,borderBottomWidth:1,borderBottomColor:C.line},
  title:{fontSize:24,fontWeight:'900',color:C.petrol,letterSpacing:-0.5},
  sub:{fontSize:13,color:C.muted,marginTop:4},
  addBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:14,alignItems:'center',margin:16,marginBottom:0},
  addBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  empty:{textAlign:'center',color:C.muted,padding:20},
  folder:{backgroundColor:C.card,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:C.line},
  folderIcon:{fontSize:26},
  folderName:{fontSize:15,fontWeight:'900',color:C.petrol},
  folderSub:{fontSize:12,color:C.muted,marginTop:2},
  chevron:{fontSize:22,color:C.muted},
  backBtn:{alignSelf:'flex-start',backgroundColor:C.soft,borderRadius:10,paddingVertical:8,paddingHorizontal:14},
  backBtnTxt:{fontSize:13,fontWeight:'800',color:C.petrol},
  prodTitle:{fontSize:18,fontWeight:'900',color:C.petrol,marginTop:4},
  filterBar:{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:4},
  filterChip:{paddingVertical:7,paddingHorizontal:12,borderRadius:99,backgroundColor:C.soft},
  docCard:{backgroundColor:C.card,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:C.line},
  docIcon:{width:44,height:44,borderRadius:10,backgroundColor:C.soft,justifyContent:'center',alignItems:'center'},
  docIconTxt:{fontSize:12,fontWeight:'900',color:C.petrol},
  docType:{fontSize:14,fontWeight:'900',color:C.petrol},
  docMeta:{fontSize:12,color:C.muted,marginTop:2},
  docName:{fontSize:11,color:C.muted,marginTop:2},
  docActions:{gap:6},
  openBtn:{backgroundColor:C.soft,borderRadius:9,paddingVertical:7,paddingHorizontal:12,alignItems:'center'},
  openBtnTxt:{fontSize:12,fontWeight:'800',color:C.petrol},
  delBtn:{backgroundColor:'#FFF5F5',borderRadius:9,paddingVertical:7,paddingHorizontal:12,alignItems:'center'},
  delBtnTxt:{fontSize:12,fontWeight:'800',color:'#E53E3E'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'flex-end'},
  modalCard:{backgroundColor:C.bg,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'90%'},
  modalTitle:{fontSize:20,fontWeight:'900',color:C.petrol,marginBottom:16,textAlign:'center'},
  label:{fontSize:13,fontWeight:'700',color:C.text,marginTop:12,marginBottom:6},
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:13,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:'white'},
  chipWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingVertical:9,paddingHorizontal:14,borderRadius:99,backgroundColor:C.soft},
  chipOn:{backgroundColor:C.petrol},
  chipTxt:{fontSize:13,fontWeight:'700',color:C.petrol},
  chipTxtOn:{fontSize:13,fontWeight:'700',color:'white'},
  monthGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
  monthChip:{width:'15%',paddingVertical:8,borderRadius:9,backgroundColor:C.soft,alignItems:'center'},
  fileBtn:{borderWidth:1,borderColor:C.petrol,borderStyle:'dashed',borderRadius:14,paddingVertical:16,alignItems:'center',backgroundColor:'white'},
  fileBtnTxt:{fontSize:14,fontWeight:'700',color:C.petrol},
  saveBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:15,alignItems:'center',marginTop:20},
  saveBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
  cancelBtn:{paddingVertical:14,alignItems:'center',marginTop:4},
  cancelBtnTxt:{color:C.muted,fontWeight:'700',fontSize:14},
});