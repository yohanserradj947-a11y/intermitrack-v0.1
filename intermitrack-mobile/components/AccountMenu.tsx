import { showAlert } from '../lib/dialog';
import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Modal, Platform, Linking, KeyboardAvoidingView, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/auth';
import NumInput from './NumInput';
import { GradientButton } from './GradientButton';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemeControls, THEME_META } from '../lib/theme';
import { usePostes } from '../lib/postes';
import { usePremium } from '../lib/premium';
import ThemeModal from './ThemeModal';
import { usePathname } from 'expo-router';
import { VEHICLES, CAR_CV, MOTO_CV, migrerVehicule, fraisAnnuels, type VehicleKind } from '../lib/kmBareme';
import { startTour } from './OnboardingTour';

// palette via useTheme()

// Ouvre directement la modale "Mes informations" depuis n'importe où (ex : le
// bouton "Renseigner mes infos" du tableau de bord). Même principe que dialog.tsx.
let _openMesInfos:(()=>void)|null=null;
export function openMesInfos(){ if(_openMesInfos)_openMesInfos(); }
// Notif "profil modifié" → le dashboard s'y abonne pour recharger tout de suite (annexe artiste/technicien, taux…).
let _profilListeners:Array<()=>void>=[];
export function onProfilChanged(fn:()=>void){ _profilListeners.push(fn); return ()=>{ _profilListeners=_profilListeners.filter(f=>f!==fn); }; }
function _emitProfilChanged(){ _profilListeners.forEach(f=>{ try{ f(); }catch(e){} }); }
// Émis par le réglage de profil au 1er lancement (ProfileSetupModal), même effet qu'un enregistrement dans « Mes informations ».
export function emitProfilChanged(){ _emitProfilChanged(); }

// Compte admin (toi) : seul à voir l'écran Analytics.
const ADMIN_EMAIL = 'yohanserradj947@gmail.com';

// Petite tuile de statistique (écran admin).
function StatBox({ label, value, C }: { label: string; value: any; C: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.soft, borderRadius: 14, padding: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.petrol }}>{value ?? '—'}</Text>
      <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// Ligne comparative App vs Site (écran admin).
function CompareRow({ label, app, web, C }: { label: string; app: any; web: any; C: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Text style={{ flex: 1, fontSize: 13.5, color: C.text, fontWeight: '600' }}>{label}</Text>
      <Text style={{ width: 58, textAlign: 'right', fontSize: 14, fontWeight: '800', color: C.petrol }}>{app ?? 0}</Text>
      <Text style={{ width: 58, textAlign: 'right', fontSize: 14, fontWeight: '800', color: C.muted }}>{web ?? 0}</Text>
    </View>
  );
}

export function AccountMenu(){
  const insets=useSafeAreaInsets();
  const { session, signOut } = useSession();
  const { themeId } = useThemeControls();
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);

  const [showAccount,setShowAccount]=useState(false);
  const [showTheme,setShowTheme]=useState(false);
  const themeLabel = THEME_META.find(t=>t.id===themeId)?.label ?? 'Sur mesure';
  const [profil,setProfil]=useState<any>(null);
  const [showStats,setShowStats]=useState(false);
  const [stats,setStats]=useState<any>(null);
  const [statsLoading,setStatsLoading]=useState(false);
  const isAdmin=(session?.user?.email||'').toLowerCase()===ADMIN_EMAIL;

  const [showMesInfos,setShowMesInfos]=useState(false);
  const { postes, addPoste, removePoste } = usePostes();
  const [miNewPoste,setMiNewPoste]=useState('');
  const [miAnnexe,setMiAnnexe]=useState<'technicien'|'artiste'|'les_deux'|''>('');
  const [miDroits,setMiDroits]=useState<boolean|null>(null);
  const [miClause,setMiClause]=useState(false);
  const { previewFree, setPreviewFree, canPreview } = usePremium();
  // Vehicule memorise : « je ne change pas ma voiture, et mon nombre de kilometres annuel ne change
  // pas d'une mission a l'autre ainsi que ma puissance fiscale » (retour JB).
  // Depuis le 16/07/2026 : type de vehicule + puissance + kilometrage annuel REEL (et non une
  // tranche) — le bareme officiel a des tranches differentes selon le vehicule et un montant fixe
  // qu'on ne peut restituer qu'a partir du kilometrage exact. Voir lib/kmBareme.
  const [miKmKind,setMiKmKind]=useState<VehicleKind>('car');
  const [miKmCv,setMiKmCv]=useState('');
  const [miKmAnnual,setMiKmAnnual]=useState('');
  const [miKmElec,setMiKmElec]=useState(false);
  const [miAj,setMiAj]=useState('');
  const [miImpot,setMiImpot]=useState('');
  // Salaire journalier (brut) : sert à pré-remplir le prix des missions et de l'import notes.
  // Lu/écrit à part (défensif) car la colonne peut ne pas exister avant la migration.
  const [miSalaireJour,setMiSalaireJour]=useState('');
  const [profilSalaireJour,setProfilSalaireJour]=useState<number|null>(null);

  useEffect(()=>{loadProfil();},[]);

  async function loadProfil(){
    const { data:{ user } }=await supabase.auth.getUser();
    if(user){ const { data }=await supabase.from('profiles').select('annexe,droits_ouverts,taux_journalier,taux_impot,km_cv,km_tranche,km_vehicle,km_annual,km_electric,clause_rattrapage').eq('id',user.id).maybeSingle(); setProfil(data||null);
      try { const r=await supabase.from('profiles').select('salaire_journalier').eq('id',user.id).maybeSingle();
        setProfilSalaireJour(r.data && r.data.salaire_journalier!=null ? Number(r.data.salaire_journalier) : null); } catch(e){}
    }
  }

  function openMesInfosModal(){
    setMiAnnexe(profil?.annexe||'');
    setMiDroits(profil?profil.droits_ouverts:null);
    setMiClause(!!(profil&&(profil as any).clause_rattrapage));
    setMiAj(profil?.taux_journalier!=null?String(profil.taux_journalier):'');
    setMiImpot(profil?.taux_impot!=null?String(profil.taux_impot):'');
    // Nouveau format si present, sinon on MIGRE l'ancien (km_cv '3'..'7'|'moto' + km_tranche '1'|'2'|'3').
    if(profil?.km_vehicle){
      setMiKmKind(profil.km_vehicle as VehicleKind);
      setMiKmCv(profil?.km_cv||'');
      setMiKmAnnual(profil?.km_annual!=null?String(profil.km_annual):'');
    } else {
      const m=migrerVehicule(profil?.km_cv, profil?.km_tranche);
      setMiKmKind(m.kind); setMiKmCv(m.cv);
      // Kilometrage seulement s'il y avait un vehicule : sinon on inventerait un chiffre.
      setMiKmAnnual(profil?.km_cv ? String(m.kmAnnuel) : '');
    }
    setMiKmElec(!!profil?.km_electric);
    setMiSalaireJour(profilSalaireJour!=null?String(profilSalaireJour):'');
    setShowMesInfos(true);
  }

  // Permet à openMesInfos() (module-singleton) d'ouvrir directement la modale.
  useEffect(()=>{
    _openMesInfos=()=>{ setShowAccount(false); openMesInfosModal(); };
    return ()=>{ _openMesInfos=null; };
  });

  async function saveMesInfos(){
    const { data:{ user } }=await supabase.auth.getUser();
    if(!user)return;
    const droits=miDroits===true;
    const { error }=await supabase.from('profiles').upsert({ id:user.id, annexe:miAnnexe||null, droits_ouverts:miDroits, clause_rattrapage:miClause, taux_journalier:droits?(Number(miAj)||null):null, taux_impot:Number(miImpot)||null, km_vehicle:miKmKind||null, km_cv:miKmCv||null, km_annual:Number(miKmAnnual)||null, km_electric:miKmElec },{onConflict:'id'});
    if(error){ showAlert('Erreur',error.message); return; }
    // Écriture séparée et défensive : ne casse pas la sauvegarde du reste si la colonne n'existe pas encore.
    try { await supabase.from('profiles').upsert({ id:user.id, salaire_journalier:Number(miSalaireJour)||null },{onConflict:'id'}); } catch(e){}
    setShowMesInfos(false); loadProfil(); _emitProfilChanged();
  }

  async function deleteAccount(){
    showAlert(
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
            showAlert('Erreur',"La suppression a échoué : "+(e?.message||'réessaie plus tard.'));
          }
        }},
      ]
    );
  }

  function reportBug(){
    setShowAccount(false);
    const body=`Décris ici le bug rencontré ou ta suggestion :\n\n\n\n— Infos techniques (merci de ne pas effacer) —\nAppareil : ${Platform.OS} ${Platform.Version}\nCompte : ${session?.user.email||'?'}`;
    const url=`mailto:Intermitrack@gmail.com?subject=${encodeURIComponent('Bug / suggestion — Intermitrack (bêta)')}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(()=>showAlert('Impossible d\'ouvrir le mail','Écris-nous directement à Intermitrack@gmail.com'));
  }

  async function openStats(){
    setShowAccount(false); setShowStats(true); setStatsLoading(true); setStats(null);
    const { data, error }=await supabase.rpc('get_admin_analytics');
    setStatsLoading(false);
    if(error){ setStats({ error:error.message }); return; }
    setStats(data);
  }

  const initials=(session?.user.email||'??').slice(0,2).toUpperCase();

  // Sur le calendrier, la pastille flottante recouvrait la flèche de changement de mois (elle est en position
  // absolue au-dessus de tous les onglets). On la masque là, et seulement là : le composant reste monté pour
  // que les modales (« Mes informations », thèmes…) restent ouvrables depuis le dashboard.
  const pathname = usePathname();
  const onCalendar = /(^|\/)calendar$/.test(pathname || '');

  return(
    <>
      {!onCalendar && (
      <TouchableOpacity style={[s.avatarBtn,{top:insets.top+8}]} onPress={()=>setShowAccount(true)} activeOpacity={0.85}>
        <Text style={s.avatarTxt}>{initials}</Text>
      </TouchableOpacity>
      )}

      <Modal visible={showAccount} animationType="fade" transparent onRequestClose={()=>setShowAccount(false)}>
        <TouchableOpacity style={s.accountOverlay} activeOpacity={1} onPress={()=>setShowAccount(false)}>
          <View style={s.accountCard}>
            <Text style={s.accountTitle}>Mon compte</Text>
            <Text style={s.accountEmail}>{session?.user.email}</Text>

            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,alignSelf:'center',marginTop:2,marginBottom:10,paddingVertical:5,paddingHorizontal:12,borderRadius:99,backgroundColor:'#FFF7E6',borderWidth:1,borderColor:'#F5C97A'}}>
              <Text style={{fontSize:12.5,fontWeight:'800',color:'#B7791F'}}>Pionnier — gratuit à vie</Text>
            </View>

            <TouchableOpacity style={s.accountReportBtn} onPress={()=>{setShowAccount(false);openMesInfosModal();}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="create-outline" size={13} color={C.petrol} /><Text style={s.accountReportTxt}>Mes informations</Text></View>
            </TouchableOpacity>

            <TouchableOpacity style={s.accountReportBtn} onPress={()=>{setShowAccount(false);setShowTheme(true);}} activeOpacity={0.85}>
              <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="color-palette-outline" size={13} color={C.petrol} /><Text style={s.accountReportTxt}>Thème — {themeLabel}</Text></View>
            </TouchableOpacity>

            <TouchableOpacity style={s.accountReportBtn} onPress={()=>{setShowAccount(false);setTimeout(startTour,300);}} activeOpacity={0.85}>
              <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="school-outline" size={13} color={C.petrol} /><Text style={s.accountReportTxt}>Revoir le tutoriel</Text></View>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={s.accountReportBtn} onPress={openStats}>
                <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="stats-chart-outline" size={13} color={C.petrol} /><Text style={s.accountReportTxt}>Analytics (admin)</Text></View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={s.accountReportBtn} onPress={reportBug}>
              <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="bug-outline" size={13} color={C.petrol} /><Text style={s.accountReportTxt}>Signaler un bug</Text></View>
            </TouchableOpacity>

            {canPreview && (
            <TouchableOpacity style={s.accountReportBtn} onPress={()=>setPreviewFree(!previewFree)}>
              <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name={previewFree?'lock-open-outline':'eye-outline'} size={13} color={C.petrol} /><Text style={s.accountReportTxt}>{previewFree?'Revenir en accès complet':'Aperçu version Gratuit (test)'}</Text></View>
            </TouchableOpacity>
            )}

            <GradientButton onPress={()=>{setShowAccount(false);signOut();}} style={s.accountBtn} textStyle={s.accountBtnTxt} label="Se déconnecter" />

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

      <ThemeModal visible={showTheme} onClose={()=>setShowTheme(false)} />

      <Modal visible={showStats} animationType="slide" transparent onRequestClose={()=>setShowStats(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>Analytics</Text>
              {statsLoading ? (
                <ActivityIndicator color={C.petrol} size="large" style={{marginVertical:34}} />
              ) : stats?.error ? (
                <Text style={{color:C.danger,textAlign:'center',marginVertical:20}}>{stats.error}</Text>
              ) : stats ? (
                <>
                  <View style={{flexDirection:'row',gap:10,marginBottom:14}}>
                    <StatBox label="Inscrits (total)" value={stats.total_users} C={C} />
                    <StatBox label="Missions créées" value={stats.total_missions} C={C} />
                  </View>

                  <Text style={s.label}>Répartition App / Site</Text>
                  <View style={{flexDirection:'row',alignItems:'center',marginBottom:2,marginTop:2}}>
                    <Text style={{flex:1}} />
                    <Text style={{width:58,textAlign:'right',fontSize:11,fontWeight:'800',color:C.petrol}}>App</Text>
                    <Text style={{width:58,textAlign:'right',fontSize:11,fontWeight:'800',color:C.muted}}>Site</Text>
                  </View>
                  <CompareRow label="Actifs (7 j)" app={stats.active_7d_mobile} web={stats.active_7d_web} C={C} />
                  <CompareRow label="Actifs (30 j)" app={stats.active_30d_mobile} web={stats.active_30d_web} C={C} />
                  <CompareRow label="Ont déjà utilisé" app={stats.users_mobile} web={stats.users_web} C={C} />
                  <CompareRow label="Événements" app={stats.events_mobile} web={stats.events_web} C={C} />

                  <Text style={[s.label,{marginTop:16}]}>Écrans les plus vus</Text>
                  {(stats.top_views||[]).map((v:any)=>(
                    <View key={v.screen} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.line}}>
                      <Text style={{color:C.text,fontWeight:'600',fontSize:14}}>{v.screen}</Text>
                      <Text style={{color:C.petrol,fontWeight:'800',fontSize:14}}>{v.n}</Text>
                    </View>
                  ))}
                </>
              ) : null}
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setShowStats(false)}><Text style={s.cancelBtnTxt}>Fermer</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showMesInfos} animationType="slide" transparent onRequestClose={()=>setShowMesInfos(false)}>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{paddingBottom:22+insets.bottom}]}>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <Text style={[s.modalTitle,{marginBottom:0}]}>Mes informations</Text>
              <TouchableOpacity onPress={()=>setShowMesInfos(false)} hitSlop={10} style={{width:34,height:34,borderRadius:17,backgroundColor:C.soft,alignItems:'center',justifyContent:'center'}}>
                <Ionicons name="close" size={20} color={C.petrol}/>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              <Text style={[s.label,{marginTop:16}]}>Tu es plutôt…</Text>
              <View style={s.typeWrap}>
                {([['technicien','Technicien (annexe 8)'],['artiste','Artiste (annexe 10)'],['les_deux','Les deux']] as ['technicien'|'artiste'|'les_deux',string][]).map(([val,lbl])=>(
                  <TouchableOpacity key={val} style={[s.typeChip,miAnnexe===val&&s.typeChipActive]} onPress={()=>setMiAnnexe(val)}>
                    <Text style={miAnnexe===val?s.typeChipTxtActive:s.typeChipTxt}>{lbl}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>As-tu déjà ouvert tes droits ?</Text>
              <View style={s.typeWrap}>
                <TouchableOpacity style={[s.typeChip,miDroits===true&&s.typeChipActive]} onPress={()=>setMiDroits(true)}>
                  <Text style={miDroits===true?s.typeChipTxtActive:s.typeChipTxt}>Oui</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.typeChip,miDroits===false&&s.typeChipActive]} onPress={()=>setMiDroits(false)}>
                  <Text style={miDroits===false?s.typeChipTxtActive:s.typeChipTxt}>Pas encore</Text>
                </TouchableOpacity>
              </View>
              {miDroits===true&&(
                <>
                  <Text style={s.label}>Ton taux journalier (AJ)</Text>
                  <NumInput style={s.input} value={miAj} onChangeText={setMiAj} placeholder="67.60" placeholderTextColor={C.muted}/>
                  <Text style={s.ftDetail}>L'allocation journalière nette de ta notification France Travail.</Text>
                </>
              )}

              <Text style={s.label}>Es-tu en clause de rattrapage ?</Text>
              <View style={s.typeWrap}>
                <TouchableOpacity style={[s.typeChip,miClause===true&&s.typeChipActive]} onPress={()=>setMiClause(true)}>
                  <Text style={miClause===true?s.typeChipTxtActive:s.typeChipTxt}>Oui</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.typeChip,miClause===false&&s.typeChipActive]} onPress={()=>setMiClause(false)}>
                  <Text style={miClause===false?s.typeChipTxtActive:s.typeChipTxt}>Non</Text>
                </TouchableOpacity>
              </View>
              {miClause && <Text style={s.ftDetail}>Un bandeau apparaîtra sur ton tableau de bord, avec le compte à rebours (6 mois après ta date anniversaire) pour atteindre 507 h.</Text>}

              <Text style={[s.label,{marginTop:16}]}>Ton salaire journalier brut <Text style={{fontWeight:'400',color:C.muted,fontSize:12}}>— pré-remplit le prix de tes missions</Text></Text>
              <NumInput style={s.input} value={miSalaireJour} onChangeText={setMiSalaireJour} placeholder="Ex : 230" placeholderTextColor={C.muted}/>

              <Text style={[s.label,{marginTop:16}]}>Ton taux d'imposition (%)</Text>
              <NumInput style={s.input} value={miImpot} onChangeText={setMiImpot} placeholder="8.6" placeholderTextColor={C.muted}/>

              <Text style={s.label}>Tes postes <Text style={{fontWeight:'400',color:C.muted,fontSize:12}}>— le 1er est proposé par défaut dans tes missions</Text></Text>
              {postes.length===0 ? <Text style={{fontSize:12,color:C.muted,marginBottom:4}}>Aucun poste — ajoute le tien ci-dessous.</Text> : (
                <View style={s.typeWrap}>
                  {postes.map(p=>(
                    <View key={p} style={[s.typeChip,s.typeChipActive,{flexDirection:'row',alignItems:'center',gap:6}]}>
                      <Text style={s.typeChipTxtActive}>{p}</Text>
                      <TouchableOpacity onPress={()=>removePoste(p)} hitSlop={8}><Text style={{color:'#fff',fontWeight:'900',fontSize:13}}>×</Text></TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <View style={{flexDirection:'row',gap:8,marginTop:8}}>
                <TextInput style={[s.input,{flex:1}]} value={miNewPoste} onChangeText={setMiNewPoste} placeholder="Ex : Clown, Cascadeur…" placeholderTextColor={C.muted}/>
                <TouchableOpacity style={{backgroundColor:C.petrol,borderRadius:12,paddingHorizontal:16,justifyContent:'center',alignItems:'center'}} onPress={()=>{const v=miNewPoste.trim();if(v){addPoste(v);setMiNewPoste('');}}}><Text style={{color:'#fff',fontWeight:'800',fontSize:13}}>Ajouter</Text></TouchableOpacity>
              </View>

              {/* Vehicule memorise -> pre-remplit les frais km de chaque mission (retour JB).
                  Les cles sont celles du bareme, identiques a l'appli ET au site : ne pas diverger. */}
              <Text style={s.label}>Ton véhicule <Text style={{fontWeight:'400',color:C.muted,fontSize:12}}>— pré-remplit tes frais kilométriques</Text></Text>
              <View style={s.typeWrap}>
                {VEHICLES.map(v=>(
                  <TouchableOpacity key={v.key} style={[s.typeChip,miKmKind===v.key&&s.typeChipActive]} onPress={()=>{setMiKmKind(v.key);setMiKmCv('');}}>
                    <Text style={miKmKind===v.key?s.typeChipTxtActive:s.typeChipTxt}>{v.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{fontSize:12,color:C.muted,marginTop:6,marginBottom:8,lineHeight:17}}>{VEHICLES.find(v=>v.key===miKmKind)?.hint}</Text>

              {/* Le cyclomoteur n'a pas de puissance : un seul barème. */}
              {miKmKind!=='cyclo' && (
                <View style={s.typeWrap}>
                  {(miKmKind==='moto'?MOTO_CV:CAR_CV).map(o=>(
                    <TouchableOpacity key={o.key} style={[s.typeChip,miKmCv===o.key&&s.typeChipActive]} onPress={()=>setMiKmCv(c=>c===o.key?'':o.key)}>
                      <Text style={miKmCv===o.key?s.typeChipTxtActive:s.typeChipTxt}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Le kilométrage RÉEL, et non une tranche : le barème comporte un montant fixe par
                  tranche qu'on ne peut restituer qu'à partir du chiffre exact. */}
              <Text style={[s.label,{marginTop:10}]}>Kilomètres parcourus par an <Text style={{fontWeight:'400',color:C.muted,fontSize:12}}>— tous trajets confondus</Text></Text>
              <NumInput style={s.input} value={miKmAnnual} onChangeText={setMiKmAnnual} placeholder="Ex : 12000" placeholderTextColor={C.muted}/>

              <TouchableOpacity style={{flexDirection:'row',alignItems:'center',gap:9,marginTop:10}} onPress={()=>setMiKmElec(v=>!v)}>
                <View style={[s.typeChip,miKmElec&&s.typeChipActive,{paddingHorizontal:12}]}>
                  <Text style={miKmElec?s.typeChipTxtActive:s.typeChipTxt}>{miKmElec?'✓ ':''}100 % électrique</Text>
                </View>
                <Text style={{fontSize:12,color:C.muted,flexShrink:1}}>Barème majoré de 20 %.</Text>
              </TouchableOpacity>

              {/* Aperçu : rend le barème concret, et permet de voir tout de suite si un réglage est faux. */}
              {(!!miKmCv||miKmKind==='cyclo') && Number(miKmAnnual)>0 && (
                <Text style={{fontSize:12.5,color:C.petrol,fontWeight:'700',marginTop:10,lineHeight:18}}>
                  Barème {new Date().getFullYear()-1} : {Math.round(fraisAnnuels(miKmKind,miKmCv,Number(miKmAnnual),miKmElec)).toLocaleString('fr-FR')} € pour {Number(miKmAnnual).toLocaleString('fr-FR')} km,
                  soit {(fraisAnnuels(miKmKind,miKmCv,Number(miKmAnnual),miKmElec)/Number(miKmAnnual)).toFixed(3).replace('.',',')} €/km appliqués à tes missions.
                </Text>
              )}

              <GradientButton onPress={saveMesInfos} style={s.saveBtn} textStyle={s.saveBtnTxt} label="Enregistrer" />
              <TouchableOpacity style={s.cancelBtn} onPress={()=>setShowMesInfos(false)}>
                <Text style={s.cancelBtnTxt}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const makeS=(C:any)=>StyleSheet.create({
  avatarBtn:{position:'absolute',right:14,zIndex:50,elevation:50,width:40,height:40,borderRadius:20,backgroundColor:C.petrol,justifyContent:'center',alignItems:'center',shadowColor:'#000',shadowOpacity:0.15,shadowRadius:6,shadowOffset:{width:0,height:2}},
  avatarTxt:{color:'white',fontWeight:'900',fontSize:14},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'flex-end'},
  modalCard:{backgroundColor:C.bg,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'90%'},
  modalTitle:{fontSize:20,fontWeight:'900',color:C.petrol,marginBottom:12,textAlign:'center'},
  label:{fontSize:13,fontWeight:'700',color:C.text,marginTop:12,marginBottom:6},
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,paddingVertical:13,paddingHorizontal:14,fontSize:15,color:C.text,backgroundColor:C.card},
  typeWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  typeChip:{paddingVertical:9,paddingHorizontal:14,borderRadius:99,backgroundColor:C.soft},
  typeChipActive:{backgroundColor:C.petrol},
  typeChipTxt:{fontSize:13,fontWeight:'700',color:C.petrol},
  typeChipTxtActive:{fontSize:13,fontWeight:'700',color:'white'},
  saveBtn:{backgroundColor:C.petrol,borderRadius:15,paddingVertical:15,alignItems:'center',marginTop:20},
  saveBtnTxt:{color:'white',fontWeight:'800',fontSize:15},
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
  accountDeleteBtn:{backgroundColor:C.warnBg,borderRadius:14,paddingVertical:14,alignItems:'center',marginTop:10},
  accountDeleteTxt:{color:C.danger,fontWeight:'800',fontSize:14},
  accountCancel:{paddingVertical:14,alignItems:'center',marginTop:4},
  accountCancelTxt:{color:C.muted,fontWeight:'700',fontSize:14},
  legalRow:{flexDirection:'row',justifyContent:'center',alignItems:'center',flexWrap:'wrap',gap:6,marginTop:14},
  legalLink:{fontSize:11,color:C.muted,fontWeight:'700',textDecorationLine:'underline'},
  legalSep:{fontSize:11,color:C.muted},
  ftDetail:{fontSize:11.5,color:C.muted,fontWeight:'600',marginTop:6},
});
