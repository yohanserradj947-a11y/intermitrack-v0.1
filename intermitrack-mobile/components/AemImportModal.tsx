import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { showAlert } from '../lib/dialog';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import NumInput from './NumInput';

const CACHET_H = 12;

// Champs extraits de l'AEM, tous MODIFIABLES avant validation (le parseur peut se tromper).
type Fields = {
  production: string; poste: string; dateDebut: string; dateFin: string;
  heures: string; jours: string; cachets: string; brut: string; estArtiste: boolean;
};

function safeName(n: string) { return (n || 'aem').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80); }

// Lit un fichier local (uri) en base64, sans module natif (FileReader est dans le runtime).
async function fileToBase64(uri: string): Promise<string> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1] || '';
}

export default function AemImportModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const C = useTheme();
  const s = makeS(C);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'pick' | 'loading' | 'form'>('pick');
  const [file, setFile] = useState<any>(null);
  const [f, setF] = useState<Fields | null>(null);
  const [storeDoc, setStoreDoc] = useState(true);
  const [saving, setSaving] = useState(false);

  function reset() { setStep('pick'); setFile(null); setF(null); setStoreDoc(true); }
  function close() { reset(); onClose(); }

  async function pickAndParse() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setFile(asset); setStep('loading');
    try {
      const b64 = await fileToBase64(asset.uri);
      const { data, error } = await supabase.functions.invoke('parse-aem', {
        body: { fileBase64: b64, mimeType: asset.mimeType || 'application/pdf' },
      });
      if (error) throw new Error(error.message || 'Analyse impossible.');
      if (!data?.ok) throw new Error(data?.error || 'Analyse impossible.');
      const x = data.fields;
      setF({
        production: String(x.production || ''), poste: String(x.poste || ''),
        dateDebut: String(x.dateDebut || ''), dateFin: String(x.dateFin || x.dateDebut || ''),
        heures: x.heures ? String(x.heures) : '', jours: x.jours ? String(x.jours) : '',
        cachets: x.cachets ? String(x.cachets) : '', brut: x.brut ? String(x.brut) : '',
        estArtiste: !!x.estArtiste,
      });
      setStep('form');
    } catch (e: any) {
      showAlert('Lecture impossible', "Je n'ai pas réussi à lire cet AEM. Tu peux réessayer avec une photo plus nette, ou saisir la mission à la main.");
      setStep('pick');
    }
  }

  async function confirm() {
    if (!f) return;
    if (!f.dateDebut) { showAlert('Date manquante', 'Indique au moins la date de début.'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Tu n\'es plus connecté.');

      const jours = Number(f.jours) || 0;
      const cachets = Number(f.cachets) || 0;
      const heures = Number(f.heures) || 0;
      const isCachet = f.estArtiste && cachets > 0;
      // En cachet : vacations = nb de cachets, heures = cachets×12 (+ heures payées à l'heure).
      // À l'heure : vacations = jours travaillés, heures = heures effectuées.
      const vac = isCachet ? cachets : (jours > 0 ? jours : 1);
      const hrs = isCachet ? Math.round((cachets * CACHET_H + heures) * 10) / 10 : heures;

      const payload = {
        user_id: user.id, production: (f.production || 'AEM').toUpperCase(), emission: null, lieu: null,
        mission_type: f.poste || 'Tournage', mission_date: f.dateDebut, end_date: f.dateFin || f.dateDebut,
        hours: hrs, vacations: vac, gross_amount: Math.round(Number(f.brut) || 0),
        is_cachet: isCachet, status: 'effectue', km_distance: 0, km_rate: 0, km_amount: 0,
      };
      const { error: insErr } = await supabase.from('missions').insert(payload);
      if (insErr) throw new Error(insErr.message);

      // Stockage optionnel du fichier dans « Mes documents » (choix de l'utilisateur).
      if (storeDoc && file) {
        try {
          const d = new Date(f.dateDebut + 'T00:00:00');
          const clean = safeName(file.name || 'aem.pdf');
          const path = `${user.id}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${Date.now()}_${clean}`;
          const ab = await (await fetch(file.uri)).arrayBuffer();
          const { error: upErr } = await supabase.storage.from('documents').upload(path, ab, { contentType: file.mimeType || 'application/octet-stream', upsert: false });
          if (!upErr) {
            await supabase.from('documents').insert({
              user_id: user.id, file_name: file.name || clean, file_path: path, document_type: 'AEM',
              production: payload.production, doc_month: d.getMonth() + 1, doc_year: d.getFullYear(), mime_type: file.mimeType || null,
            });
          }
        } catch (e) { /* le document est un bonus : on n'échoue pas la mission pour ça */ }
      }
      setSaving(false);
      onSaved(); close();
    } catch (e: any) {
      setSaving(false);
      showAlert('Erreur', e.message || "L'enregistrement n'a pas abouti.");
    }
  }

  const upd = (k: keyof Fields, v: any) => setF(p => p ? { ...p, [k]: v } : p);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.overlay}>
          <View style={[s.card, { paddingBottom: 22 + insets.bottom }]}>
            <View style={s.head}>
              <Text style={s.title}>Importer un AEM</Text>
              <TouchableOpacity style={s.close} onPress={close} hitSlop={8}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {step === 'pick' && (<>
                <Text style={s.intro}>Choisis le PDF ou la photo de ton attestation employeur mensuelle. Je lis les infos et te les montre avant d'enregistrer.</Text>
                <TouchableOpacity style={s.bigBtn} onPress={pickAndParse}>
                  <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                  <Text style={s.bigBtnTxt}>Choisir mon AEM (PDF ou photo)</Text>
                </TouchableOpacity>
                <Text style={s.hint}>Ton fichier est analysé puis oublié. Il n'est stocké que si tu le demandes à l'étape suivante.</Text>
              </>)}

              {step === 'loading' && (
                <View style={{ alignItems: 'center', paddingVertical: 36, gap: 14 }}>
                  <ActivityIndicator size="large" color={C.petrol} />
                  <Text style={s.intro}>Lecture de ton AEM…</Text>
                </View>
              )}

              {step === 'form' && f && (<>
                <Text style={s.intro}>Vérifie et corrige si besoin, puis valide. La mission apparaîtra sur ton calendrier.</Text>
                <Text style={s.label}>Production (employeur)</Text>
                <TextInput style={s.input} value={f.production} onChangeText={(v: string) => upd('production', v)} placeholder="Ex : ENDEMOL PRODUCTION" placeholderTextColor={C.muted} autoCapitalize="characters" />
                <Text style={s.label}>Poste</Text>
                <TextInput style={s.input} value={f.poste} onChangeText={(v: string) => upd('poste', v)} placeholder="Ex : Électricien" placeholderTextColor={C.muted} />
                <View style={s.row}>
                  <View style={{ flex: 1 }}><Text style={s.label}>Date début</Text><TextInput style={s.input} value={f.dateDebut} onChangeText={(v: string) => upd('dateDebut', v)} placeholder="AAAA-MM-JJ" placeholderTextColor={C.muted} /></View>
                  <View style={{ flex: 1 }}><Text style={s.label}>Date fin</Text><TextInput style={s.input} value={f.dateFin} onChangeText={(v: string) => upd('dateFin', v)} placeholder="AAAA-MM-JJ" placeholderTextColor={C.muted} /></View>
                </View>
                <View style={s.roleBox}>
                  <TouchableOpacity style={[s.roleOpt, !f.estArtiste && s.roleOptTech]} onPress={() => upd('estArtiste', false)}><Text style={[s.roleTxt, !f.estArtiste && s.roleTxtOn]}>Technicien (heures)</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.roleOpt, f.estArtiste && s.roleOptArt]} onPress={() => upd('estArtiste', true)}><Text style={[s.roleTxt, f.estArtiste && s.roleTxtOn]}>Artiste (cachets)</Text></TouchableOpacity>
                </View>
                <View style={s.row}>
                  <View style={{ flex: 1 }}><Text style={s.label}>Heures</Text><NumInput style={s.input} value={f.heures} onChangeText={(v: string) => upd('heures', v)} placeholder="0" placeholderTextColor={C.muted} /></View>
                  {f.estArtiste
                    ? <View style={{ flex: 1 }}><Text style={s.label}>Cachets</Text><NumInput style={s.input} value={f.cachets} onChangeText={(v: string) => upd('cachets', v)} placeholder="0" placeholderTextColor={C.muted} /></View>
                    : <View style={{ flex: 1 }}><Text style={s.label}>Jours travaillés</Text><NumInput style={s.input} value={f.jours} onChangeText={(v: string) => upd('jours', v)} placeholder="0" placeholderTextColor={C.muted} /></View>}
                </View>
                <Text style={s.label}>Brut (€)</Text>
                <NumInput style={s.input} value={f.brut} onChangeText={(v: string) => upd('brut', v)} placeholder="0" placeholderTextColor={C.muted} />

                <View style={s.storeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.storeTitle}>Garder l'AEM dans mes documents ?</Text>
                    <Text style={s.storeSub}>Le fichier sera rangé dans l'onglet Documents.</Text>
                  </View>
                  <Switch value={storeDoc} onValueChange={setStoreDoc} trackColor={{ true: C.petrol }} />
                </View>

                <TouchableOpacity style={[s.save, saving && { opacity: 0.6 }]} onPress={confirm} disabled={saving}>
                  <Text style={s.saveTxt}>{saving ? 'Enregistrement…' : 'Valider et créer la mission'}</Text>
                </TouchableOpacity>
              </>)}

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeS = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%', paddingHorizontal: 22, paddingTop: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '900', color: C.petrol },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft },
  intro: { fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 12 },
  hint: { fontSize: 11.5, color: C.muted, lineHeight: 16, marginTop: 12, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.card },
  row: { flexDirection: 'row', gap: 10 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 16, marginTop: 6 },
  bigBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  roleBox: { flexDirection: 'row', gap: 10, marginTop: 14 },
  roleOpt: { flex: 1, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  roleOptTech: { borderColor: C.petrol, backgroundColor: C.petrol },
  roleOptArt: { borderColor: C.orange, backgroundColor: C.orange },
  roleTxt: { fontSize: 14, fontWeight: '800', color: C.text },
  roleTxtOn: { color: '#fff' },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, backgroundColor: C.soft, borderRadius: 14, padding: 14 },
  storeTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  storeSub: { fontSize: 11.5, color: C.muted, marginTop: 2 },
  save: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
