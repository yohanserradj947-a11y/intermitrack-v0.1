import { useState } from 'react';
import { StyleSheet, View, Text, Image, TextInput, TouchableOpacity, StatusBar, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../lib/auth';
import { GradientButton } from '../components/GradientButton';

const C = { petrol:'#1F4E5F', bg:'#F5F7F6', card:'#FFFFFF', text:'#2D3748', muted:'#718096', line:'#E2E8F0', soft:'#EEF4F1' };

function traduire(msg: string) {
  if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/already registered/i.test(msg)) return 'Cet email a déjà un compte. Connecte-toi.';
  if (/Password should be at least/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/Unable to validate email/i.test(msg)) return 'Adresse email invalide.';
  if (/Token has expired or is invalid/i.test(msg)) return 'Code incorrect ou expiré. Renvoie un code.';
  if (/For security purposes/i.test(msg)) return 'Patiente quelques secondes avant de redemander un code.';
  return msg;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, sendResetCode, verifyResetCode } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Réinitialisation du mot de passe
  const [resetStep, setResetStep] = useState<'none' | 'ask' | 'code'>('none');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  async function submit() {
    setInfo(null);
    if (!email.trim() || !password) { setInfo('Renseigne ton email et ton mot de passe.'); return; }
    if (mode === 'signup' && password.length < 6) { setInfo('Le mot de passe doit faire au moins 6 caractères.'); return; }
    setBusy(true);
    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) setInfo(traduire(error));
    } else {
      const { error, needsConfirmation } = await signUp(email, password);
      if (error) setInfo(traduire(error));
      else if (needsConfirmation) setInfo('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.');
    }
    setBusy(false);
  }

  async function askResetCode() {
    setInfo(null);
    if (!email.trim()) { setInfo('Entre ton adresse email d\'abord, puis appuie sur « Mot de passe oublié ».'); return; }
    setBusy(true);
    const { error } = await sendResetCode(email);
    setBusy(false);
    if (error) { setInfo(traduire(error)); return; }
    setResetStep('code');
    setInfo('Un code vient d\'être envoyé à ' + email.trim() + '. Vérifie tes mails (et les spams).');
  }

  async function confirmReset() {
    setInfo(null);
    if (!resetCode.trim()) { setInfo('Entre le code reçu par email.'); return; }
    if (newPassword.length < 6) { setInfo('Le nouveau mot de passe doit faire au moins 6 caractères.'); return; }
    setBusy(true);
    const { error } = await verifyResetCode(email, resetCode, newPassword);
    setBusy(false);
    if (error) { setInfo(traduire(error)); return; }
    // Succès : l'utilisateur est maintenant connecté avec son nouveau mot de passe
    setResetStep('none');
    setResetCode('');
    setNewPassword('');
  }

  return (
    <View style={s.flex}>
      <LinearGradient colors={['#1F4E5F', '#155E54', '#12754A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Image source={require('../assets/images/icon.png')} style={s.watermark} resizeMode="contain" />
      <StatusBar barStyle="light-content" backgroundColor={C.petrol} />
      <KeyboardAwareScrollView
        style={s.scroll}
        contentContainerStyle={[s.page, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={90}
        showsVerticalScrollIndicator={false}
      >
      <View style={s.container}>
          <View style={s.brand}>
            <Image source={require('../assets/images/icon.png')} style={s.logoBox} resizeMode="cover" />
            <Text style={s.mainline}>{"Toute votre\nintermittence\nau même endroit."}</Text>
            <Text style={s.intro}>{"Suivi des missions, heures ARE,\ndocuments et prévisions."}</Text>
            <View style={s.features}>
              <View style={s.featurePill}><Text style={s.featureTxt}>⏱ Heures & ARE</Text></View>
              <View style={s.featurePill}><Text style={s.featureTxt}>📅 Missions</Text></View>
              <View style={s.featurePill}><Text style={s.featureTxt}>💶 Fiscalité</Text></View>
            </View>
          </View>

          <View style={s.card}>
            {resetStep === 'none' && (
              <>
                <View style={s.tabs}>
                  <TouchableOpacity style={[s.tab, mode === 'signin' && s.tabActive]} onPress={() => { setMode('signin'); setInfo(null); }}>
                    <Text style={mode === 'signin' ? s.tabTxtActive : s.tabTxt}>Connexion</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.tab, mode === 'signup' && s.tabActive]} onPress={() => { setMode('signup'); setInfo(null); }}>
                    <Text style={mode === 'signup' ? s.tabTxtActive : s.tabTxt}>Créer un compte</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.label}>Email</Text>
                <TextInput style={s.input} placeholder="votre@email.com" placeholderTextColor={C.muted}
                  value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />

                <Text style={s.label}>Mot de passe</Text>
                <View style={s.passwordWrap}>
                  <TextInput style={s.passwordInput} placeholder="Minimum 6 caractères" placeholderTextColor={C.muted}
                    value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" returnKeyType="done" onSubmitEditing={submit} />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={C.muted} />
                  </TouchableOpacity>
                </View>

                {info && <Text style={s.info}>{info}</Text>}

                <GradientButton onPress={submit} disabled={busy} style={s.btn} textStyle={s.btnTxt} label={busy ? 'Patiente…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'} />

                {mode === 'signin' && (
                  <TouchableOpacity onPress={askResetCode} disabled={busy} style={s.forgotBtn}>
                    <Text style={s.forgotTxt}>Mot de passe oublié ?</Text>
                  </TouchableOpacity>
                )}

                {mode === 'signup' && (
                  <Text style={s.consent}>
                    En créant un compte, tu acceptes nos CGU et notre politique de confidentialité.
                  </Text>
                )}
              </>
            )}

            {resetStep === 'code' && (
              <>
                <Text style={s.resetTitle}>Réinitialiser le mot de passe</Text>
                <Text style={s.resetSub}>Entre le code reçu par email et choisis un nouveau mot de passe.</Text>

                <Text style={s.label}>Code reçu par email</Text>
                <TextInput style={s.input} placeholder="Entrez le code" placeholderTextColor={C.muted}
                  value={resetCode} onChangeText={setResetCode} keyboardType="number-pad" maxLength={8} returnKeyType="next" />

                <Text style={s.label}>Nouveau mot de passe</Text>
                <View style={s.passwordWrap}>
                  <TextInput style={s.passwordInput} placeholder="Minimum 6 caractères" placeholderTextColor={C.muted}
                    value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showNewPassword} autoCapitalize="none" returnKeyType="done" onSubmitEditing={confirmReset} />
                  <TouchableOpacity onPress={() => setShowNewPassword(v => !v)} style={s.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={C.muted} />
                  </TouchableOpacity>
                </View>

                {info && <Text style={s.info}>{info}</Text>}

                <GradientButton onPress={confirmReset} disabled={busy} style={s.btn} textStyle={s.btnTxt} label={busy ? 'Patiente…' : 'Valider le nouveau mot de passe'} />

                <TouchableOpacity onPress={askResetCode} disabled={busy} style={s.forgotBtn}>
                  <Text style={s.forgotTxt}>Renvoyer un code</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setResetStep('none'); setInfo(null); setResetCode(''); setNewPassword(''); }} style={s.forgotBtn}>
                  <Text style={s.forgotTxt}>Retour à la connexion</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={s.secure}>🔒 Données chiffrées — accès uniquement à votre compte</Text>

          <View style={s.legalRow}>
            <TouchableOpacity onPress={() => Linking.openURL('https://intermitrack.fr/cgu.html')}>
              <Text style={s.legalLink}>CGU</Text>
            </TouchableOpacity>
            <Text style={s.legalSep}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://intermitrack.fr/confidentialite.html')}>
              <Text style={s.legalLink}>Confidentialité</Text>
            </TouchableOpacity>
            <Text style={s.legalSep}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://intermitrack.fr/mentions-legales.html')}>
              <Text style={s.legalLink}>Mentions légales</Text>
            </TouchableOpacity>
          </View>
      </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.petrol },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  watermark: { position: 'absolute', width: 360, height: 360, top: -70, right: -90, opacity: 0.06 },
  // flexGrow + justifyContent center : le formulaire se centre verticalement et
  // peut remonter/scroller quand le clavier s'ouvre (iPhone ET iPad).
  page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22 },
  // maxWidth : empêche la carte de s'étirer et d'être « crowded » sur grand écran (iPad).
  container: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: 28 },
  logoBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.petrol, justifyContent: 'center', alignItems: 'center' },
  logoTxt: { color: 'white', fontWeight: '800', fontSize: 22 },
  mainline: { fontSize: 24, fontWeight: '900', color: 'white', textAlign: 'center', lineHeight: 30, letterSpacing: -0.5, marginTop: 14 },
  intro: { fontSize: 13, color: 'rgba(255,255,255,.65)', textAlign: 'center', marginTop: 8, lineHeight: 18 },
  features: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  featurePill: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12 },
  featureTxt: { color: 'white', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 22, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 14, backgroundColor: C.soft, alignItems: 'center' },
  tabActive: { backgroundColor: C.petrol },
  tabTxt: { fontSize: 13, fontWeight: '800', color: C.petrol },
  tabTxtActive: { fontSize: 13, fontWeight: '800', color: 'white' },
  label: { fontWeight: '700', fontSize: 13, color: C.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: 'white' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: 'white', paddingRight: 10 },
  passwordInput: { flex: 1, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: C.text },
  eyeBtn: { padding: 6 },
  info: { fontSize: 13, color: C.petrol, marginTop: 12, fontWeight: '600', textAlign: 'center' },
  btn: { backgroundColor: C.petrol, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  btnTxt: { color: 'white', fontWeight: '800', fontSize: 15 },
  forgotBtn: { alignItems: 'center', marginTop: 14 },
  forgotTxt: { color: C.petrol, fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' },
  resetTitle: { fontSize: 18, fontWeight: '900', color: C.petrol, textAlign: 'center', marginBottom: 6 },
  resetSub: { fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 6, lineHeight: 18 },
  consent: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  secure: { color: 'rgba(255,255,255,.5)', fontSize: 12, textAlign: 'center', marginTop: 16 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  legalLink: { fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: '700', textDecorationLine: 'underline' },
  legalSep: { fontSize: 11, color: 'rgba(255,255,255,.5)' },
});
